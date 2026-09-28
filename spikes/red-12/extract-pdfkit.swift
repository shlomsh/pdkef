#!/usr/bin/swift
import Foundation
import PDFKit

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    fail("usage: swift extract-pdfkit.swift <file.pdf> [--find <string>]")
}

let path = args[1]
let url = URL(fileURLWithPath: path)
guard let document = PDFDocument(url: url) else {
    fail("could not open PDF at \(path)")
}

func roundTo2(_ value: CGFloat) -> Double {
    return (Double(value) * 100).rounded() / 100
}

if args.count >= 4, args[2] == "--find" {
    let query = args[3]
    let selections = document.findString(query, withOptions: .caseInsensitive)
    var hits: [[String: Any]] = []
    for selection in selections {
        for page in selection.pages {
            let pageIndex = document.index(for: page)
            let text = selection.string ?? ""
            hits.append(["page": pageIndex, "text": text])
        }
    }
    let result: [String: Any] = [
        "engine": "pdfkit",
        "find": query,
        "hits": hits
    ]
    let data = try! JSONSerialization.data(withJSONObject: result, options: [])
    FileHandle.standardOutput.write(data)
    exit(0)
}

var pages: [[String: Any]] = []

for pageIndex in 0..<document.pageCount {
    guard let page = document.page(at: pageIndex) else { continue }
    let text = page.string ?? ""
    let nsText = text as NSString
    var chars: [[String: Any]] = []

    let numberOfCharacters = page.numberOfCharacters
    for i in 0..<numberOfCharacters {
        guard i < nsText.length else { continue }
        let bounds = page.characterBounds(at: i)
        if bounds.width <= 0 || bounds.height <= 0 {
            continue
        }
        let charString = nsText.substring(with: NSRange(location: i, length: 1))
        let box: [Double] = [
            roundTo2(bounds.minX),
            roundTo2(bounds.minY),
            roundTo2(bounds.maxX),
            roundTo2(bounds.maxY)
        ]
        chars.append(["c": charString, "box": box])
    }

    pages.append(["text": text, "chars": chars])
}

let result: [String: Any] = [
    "engine": "pdfkit",
    "pages": pages
]

let data = try! JSONSerialization.data(withJSONObject: result, options: [])
FileHandle.standardOutput.write(data)

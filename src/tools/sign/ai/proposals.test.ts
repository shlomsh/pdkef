import {describe, expect, it} from 'vitest';
import {proposalElements, validateAnalysis} from './proposals.ts';
import {createPageGeometry, pagePercentToPdfPoint, pdfPointToPagePercent} from '../../../editor/geometry/coords.ts';
import {captureAddedElement, createActionEntry} from '../../../editor/model/actionHistory.ts';
import {reducer, type SignToolState} from '../components/SignToolContext.tsx';

const field = {id: 'name', label: 'Name', kind: 'text' as const, x: 100, y: 200, width: 300, height: 40, value: 'Example Person'};
const geometry = createPageGeometry({cropBox: {x: 25, y: 35, width: 600, height: 800}, rotation: 90, userUnit: 2});
describe('AI PDF proposal boundaries and editable placement', () => {
  it('rejects malformed, duplicate and outside-page proposals before application', () => {
    expect(validateAnalysis({fields: [field], questions: []}, 1000, 1000).fields).toHaveLength(1);
    for (const candidate of [{...field,x: -1}, {...field,width: NaN}, {...field,width: 1001}, {...field,kind: 'signature'}, {...field,value: 3}]) {
      expect(() => validateAnalysis({fields: [candidate], questions: []},1000,1000)).toThrow();
    }
    expect(() => validateAnalysis({fields: [field,field], questions: []},1000,1000)).toThrow();
    expect(() => validateAnalysis({fields: [], questions: [null]},1000,1000)).toThrow();
    const fields = Array.from({length: 200},(_,index) => ({...field,id:String(index)}));
    expect(validateAnalysis({fields,questions:[]},1000,1000).fields).toHaveLength(200);
    expect(() => validateAnalysis({fields:[...fields,{...field,id:'overflow'}],questions:[]},1000,1000)).toThrow();
  });
  it('places normal Hebrew as a spanned editable cell, preserving rotated/cropped viewport coordinates', () => {
    const [element] = proposalElements([{...field,value: 'דוגמה ישראלי'}], {width: 1000,height: 1000}, 1, geometry);
    expect(element).toMatchObject({type:'text',pageIndex:1,left:10,minWidth:30,text:'דוגמה ישראלי'});
    expect(element).not.toHaveProperty('width');
    const raw = pagePercentToPdfPoint({x:10,y:20},geometry);
    expect(pdfPointToPagePercent(raw,geometry)).toEqual({x:10,y:20});
  });
  it('only marks answered checkboxes, with ink fitted to the target square', () => {
    const input = {...field,kind:'checkbox' as const,width:20,height:20,value:'true'};
    const [element] = proposalElements([input],{width:1000,height:1000},0,geometry);
    expect(element).toMatchObject({type:'symbol',pageIndex:0,mark:'check'});
    expect(proposalElements([{...input,value:null},{...input,value:'false'}],{width:1000,height:1000},0,geometry)).toEqual([]);
  });
  it('the existing history restores an entire AI batch with one undo and redo', () => {
    const elements = proposalElements([field,{...field,id:'address',x:500}],{width:1000,height:1000},0,geometry);
    let state: SignToolState = {selectedTool:null,toolLocked:false,elements:[],activeElementId:null,editingElementId:null,actionHistory:[],redoHistory:[],documentRevision:0,carried:{},appStyle:{}};
    for (const element of elements) state = reducer(state,{type:'ADD_ELEMENT',payload:element});
    state = reducer(state,{type:'ADD_ACTION_HISTORY',payload:createActionEntry({operation:'add',type:'AI_FILL',pageIndex:0,description:'Applied AI answers',elements:elements.map((element,index) => captureAddedElement(element,index))})});
    state = reducer(state,{type:'UNDO'});
    expect(state.elements).toEqual([]);
    state = reducer(state,{type:'REDO'});
    expect(state.elements).toEqual(elements);
  });
});

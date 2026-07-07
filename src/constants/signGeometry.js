/**
 * @file signGeometry.js
 * @description Centralized geometry, sizing, aspect ratios, and padding constants for the PDF signing tool.
 */

// Colors & Formatting Fallbacks
export const DEFAULT_COLOR_BLUE = '#1463ff';
export const DEFAULT_WHITEOUT_COLOR = '#ffffff';

// Sizing Defaults & Limits
export const DEFAULT_START_WIDTH_PCT = 20;            // Default width percentage of placed elements
export const DEFAULT_FONT_SIZE_PT = 12;               // Default font size in points (pt)
export const MIN_FONT_SIZE_PT = 6;                    // Minimum font size in points (pt)
export const MAX_FONT_SIZE_PT = 72;                   // Maximum font size in points (pt)
export const MIN_SYMBOL_WIDTH_PX = 14;                // Minimum symbol size in pixels (px)
export const MIN_STANDARD_WIDTH_PCT = 3;              // Minimum width for standard elements (signature, shape) (%)
export const MAX_SYMBOL_SIGNATURE_WIDTH_PCT = 60;     // Max drag/resize width limit for symbol/signature (%)
export const MIN_SHAPE_SIZE_PCT = 1;                  // Minimum size for shapes and whiteouts (%)
export const MAX_SHAPE_SIZE_PCT = 90;                 // Maximum size for shapes and whiteouts (%)
export const DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT = 4;  // Default fallback element width (%)
export const DEFAULT_FALLBACK_ELEMENT_HEIGHT_PCT = 2; // Default fallback element height (%)
export const DEFAULT_SYMBOL_WIDTH_PCT = 5;            // Default symbol placement width (%)

// Aspect Ratios
export const ASPECT_RATIO_SYMBOL = 1;                 // Aspect ratio for symbol nodes (width/height = 1)
export const ASPECT_RATIO_TEXT = 0.4;                 // Default aspect ratio fallback for text/other nodes

// Minimum Threshold Adjustments
export const MIN_LINE_LENGTH_PCT = 1;                 // Minimum line length (%) below which a line is reset
export const LINE_RESET_SPREAD_PCT = 6;               // How far a reset line spreads horizontally from start point (%)
export const MIN_SHAPE_THRESHOLD_PCT = 0.5;           // Sizing threshold (%) below which a shape must be ensured minimum size

// Fallback Sizes & Offsets for Click-Placed Elements
export const DEFAULT_WHITEOUT_WIDTH_PCT = 10;
export const DEFAULT_WHITEOUT_HEIGHT_PCT = 4;
export const DEFAULT_WHITEOUT_LEFT_OFFSET_PCT = 5;
export const DEFAULT_WHITEOUT_TOP_OFFSET_PCT = 2;

export const DEFAULT_SHAPE_FALLBACK_WIDTH_PCT = 8;
export const DEFAULT_SHAPE_FALLBACK_ASPECT_RATIO = 1;

// Text Rendering & Padding Multipliers
export const HELVETICA_BASELINE_OFFSET_EM = 0.85;      // Fallback Helvetica baseline offset (em)
export const DEFAULT_LINE_HEIGHT_EM = 1.2;              // Default text line height multiplier (em)
export const TEXT_BOX_PADDING_EM = 0.3;                // Text box padding (em) matching editor styles

// Miscellaneous UI Sizing/Offsets
export const TOOLBAR_FLOATING_OFFSET = 8;             // Offset in pixels for Floating UI positioning
export const LINE_TOOLBAR_MARGIN_TOP_PX = -10;         // Margin top offset in pixels for line toolbar positioning
export const TEXT_RESIZE_SCALE_FACTOR = 0.2;          // Font size scaling rate relative to drag offset
export const LINE_HIT_TARGET_STOKE_WIDTH = 20;        // Interactive stroke thickness for easier clicking (px)
export const DEFAULT_STROKE_WIDTH = 3;                // Default stroke width for lines/shapes
export const DEFAULT_FONT_FAMILY = 'Arimo';           // Default font family
export const PAGE_WIDTH_DEFAULT_PTS = 612;             // Fallback page width in points (US Letter)
export const PAGE_HEIGHT_DEFAULT_PTS = 792;            // Fallback page height in points (US Letter)

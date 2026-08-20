// The icons a content-collection entry is allowed to name.
//
// Content entries are YAML, and YAML cannot hold a component - Astro's content
// layer serialises every entry into its data store, so a function would not
// survive the round trip anyway. Entries therefore name an icon as a string and
// this map turns it back into a component at render time.
//
// The point of the map is that the string is checked. `CONTENT_ICON_NAMES` is
// what src/content.config.ts builds its `z.enum()` from, so a typo in a YAML
// file ("Trash" for "Trash2") fails the build with the list of valid names
// instead of rendering nothing. Adding an icon is one import plus one entry
// here; nothing else needs to know.
import {
  AlertTriangle,
  Code2,
  Compass,
  Download,
  Droplets,
  FileEdit,
  GitFork,
  HardDriveDownload,
  Laptop,
  Layers,
  Lightbulb,
  ListChecks,
  Monitor,
  MousePointerClick,
  PenLine,
  PenTool,
  Plane,
  Printer,
  Save,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
  Trash2,
  UserX,
  WifiOff,
} from 'lucide-preact';

export const CONTENT_ICONS = {
  AlertTriangle,
  Code2,
  Compass,
  Download,
  Droplets,
  FileEdit,
  GitFork,
  HardDriveDownload,
  Laptop,
  Layers,
  Lightbulb,
  ListChecks,
  Monitor,
  MousePointerClick,
  PenLine,
  PenTool,
  Plane,
  Printer,
  Save,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
  Trash2,
  UserX,
  WifiOff,
};

export type ContentIconName = keyof typeof CONTENT_ICONS;

/** Tuple form, because `z.enum()` wants at least one literal member. */
export const CONTENT_ICON_NAMES = Object.keys(CONTENT_ICONS) as [
  ContentIconName,
  ...ContentIconName[],
];

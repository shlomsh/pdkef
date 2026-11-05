// DRIVE-01: Google's Picker, the file chooser Drive draws itself. Loaded on demand, only on /drive/.
import { DRIVE_APP_ID, DRIVE_PICKER_KEY, PICKER_SRC } from './driveConfig.ts';
import type { PickerLabels } from './driveMessages.ts';
import type { DrivePickedDoc, DrivePickResult } from './types.ts';

type PickerData = { action: string; docs?: DrivePickedDoc[] };
type PickerApi = {
  Action: { PICKED: string; CANCEL: string };
  Feature: { MULTISELECT_ENABLED: string };
  DocsViewMode: { LIST: string };
  ViewId: { DOCS: string };
  DocsView: new (viewId?: string) => {
    setMimeTypes: (t: string) => any; setIncludeFolders: (v: boolean) => any; setMode: (m: string) => any;
    setLabel: (l: string) => any; setParent: (p: string) => any; setOwnedByMe: (v: boolean) => any; setStarred: (v: boolean) => any;
  };
  PickerBuilder: new () => any;
};
type Gapi = { load: (name: string, options: { callback: () => void; onerror?: () => void }) => void };

let load: Promise<boolean> | null = null;

export function loadPicker(): Promise<boolean> {
  if (!load) {
    load = new Promise((resolve) => {
      const fail = (script: HTMLScriptElement) => {
        load = null; // a later try may succeed once the connection is back
        script.remove();
        resolve(false);
      };
      const script = document.createElement('script');
      script.src = PICKER_SRC;
      script.async = true;
      script.onload = () => {
        const gapi = (window as unknown as { gapi?: Gapi }).gapi;
        if (!gapi) return fail(script);
        gapi.load('picker', { callback: () => resolve(true), onerror: () => fail(script) });
      };
      script.onerror = () => fail(script);
      document.head.appendChild(script);
    });
  }
  return load;
}

/** Shows the Picker and resolves when the person picks or closes it; the frame is disposed either way. */
export function openPicker(opts: {
  token: string;
  multi: boolean;
  mimeTypes: readonly string[];
  labels: PickerLabels;
  locale?: string;
}): Promise<DrivePickResult> {
  const { picker } = (window as unknown as { google: { picker: PickerApi } }).google;
  return new Promise((resolve) => {
    const mimes = opts.mimeTypes.join(',');
    const view = (label: string, folders: boolean) => {
      const v = new picker.DocsView(picker.ViewId.DOCS).setMimeTypes(mimes).setIncludeFolders(folders).setLabel(label);
      v.setMode(picker.DocsViewMode.LIST);
      return v;
    };
    // Recent first so it opens; then the places a person looks next.
    const builder = new picker.PickerBuilder()
      .addView(view(opts.labels.recent, false))
      .addView(view(opts.labels.myDrive, true).setParent('root'))
      .addView(view(opts.labels.shared, true).setOwnedByMe(false))
      .addView(view(opts.labels.starred, true).setStarred(true))
      .setTitle(opts.labels.title);
    if (opts.locale) builder.setLocale(opts.locale);
    if (opts.multi) builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    let built: { dispose: () => void; setVisible: (v: boolean) => void } | null = null;
    builder
      .setDeveloperKey(DRIVE_PICKER_KEY)
      .setAppId(DRIVE_APP_ID)
      .setOAuthToken(opts.token)
      .setOrigin(location.origin)
      .setCallback((data: PickerData) => {
        if (data.action !== picker.Action.PICKED && data.action !== picker.Action.CANCEL) return;
        built?.dispose();
        resolve(data.action === picker.Action.PICKED
          ? { action: 'picked', docs: (data.docs ?? []).map(({ id, name, mimeType }) => ({ id, name, mimeType })) }
          : { action: 'cancel' });
      });
    built = builder.build();
    built!.setVisible(true);
  });
}

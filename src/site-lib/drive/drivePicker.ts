// DRIVE-01: Google's Picker, the file chooser Drive draws itself. Loaded on demand, only on /drive/.
import { DRIVE_APP_ID, DRIVE_PICKER_KEY, PICKER_SRC } from './driveConfig.ts';
import type { DrivePickedDoc, DrivePickResult } from './types.ts';

type PickerData = { action: string; docs?: DrivePickedDoc[] };
type PickerApi = {
  Action: { PICKED: string; CANCEL: string };
  Feature: { MULTISELECT_ENABLED: string };
  DocsViewMode: { LIST: string };
  DocsView: new () => { setMimeTypes: (t: string) => any; setIncludeFolders: (v: boolean) => any; setMode: (m: string) => any };
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
export function openPicker(opts: { token: string; multi: boolean; mimeTypes: readonly string[] }): Promise<DrivePickResult> {
  const { picker } = (window as unknown as { google: { picker: PickerApi } }).google;
  return new Promise((resolve) => {
    const view = new picker.DocsView().setMimeTypes(opts.mimeTypes.join(',')).setIncludeFolders(true);
    view.setMode(picker.DocsViewMode.LIST);
    const builder = new picker.PickerBuilder().addView(view);
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

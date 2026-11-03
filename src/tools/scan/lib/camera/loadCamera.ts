type Camera = typeof import('../../components/Viewfinder.tsx');
let viewfinderPromise: Promise<Camera> | null = null;

/** The viewfinder, camera hook and their code load once, when Start scanning is first touched. */
export const loadViewfinder = () => (viewfinderPromise ??= import('../../components/Viewfinder.tsx'));

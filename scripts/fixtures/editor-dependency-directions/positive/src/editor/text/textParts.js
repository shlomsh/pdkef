let parts = { text: 'text' };

export const registerTextParts = (next) => { parts = next; };
export const getTextParts = () => parts;

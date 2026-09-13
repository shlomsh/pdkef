let names = { text: 'text' };

export const registerTextElementClassNames = (next) => { names = next; };
export const getTextElementClassNames = () => names;

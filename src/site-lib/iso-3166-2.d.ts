declare module 'iso-3166-2' {
  const iso: { subdivision(code: string): { name?: string } | undefined };
  export default iso;
}

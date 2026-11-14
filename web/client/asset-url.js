/** Resolve exported game assets beside index.html, including itch's CDN subdirectory. */
export function assetUrl(path,base=globalThis.document?.baseURI??globalThis.location?.href){
 if(path===null||path===undefined)return path;
 const value=String(path),relative=value.startsWith('/assets/')?value.slice(1):value;
 // Non-browser consumers can retain the existing relative fetch/loader contract.
 return base?new URL(relative,base).href:value;
}

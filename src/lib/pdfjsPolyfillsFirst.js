// Side effect only: installs the built-ins pdf.js calls. Exists so a worker entry can
// import it BEFORE the pdf.js worker, since static imports evaluate in source order.
import { installPdfjsPolyfills } from './pdfjsPolyfills.js';

installPdfjsPolyfills();

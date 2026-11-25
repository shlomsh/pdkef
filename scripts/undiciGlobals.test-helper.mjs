// Node has its own fetch but no Cache Storage, and undici's Cache takes only undici's own Request and Response. So a test
// of the service worker runs on undici throughout. Import this before anything that keeps hold of those globals (MSW does).
import undici from 'undici';

undici.install();
undici.setGlobalOrigin('https://pdkef.test');

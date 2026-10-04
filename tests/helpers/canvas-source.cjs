const fs = require('node:fs');
const path = require('node:path');

/** Read a canvas's production script group for existing function-level tests.
 * Other files are read normally. Script order comes from the actual page, so
 * tests cannot accidentally keep exercising a stale copy of the old monolith.
 */
function readCanvasSource(filename, options) {
    const absolute = path.resolve(String(filename));
    const root = path.resolve(__dirname, '../..');
    const classic = path.join(root, 'static/js/canvas.js');
    const smart = path.join(root, 'static/js/smart-canvas.js');
    if (absolute !== classic && absolute !== smart) return fs.readFileSync(filename, options);
    const page = fs.readFileSync(path.join(root, 'static', absolute === classic ? 'canvas.html' : 'smart-canvas.html'), 'utf8');
    const scripts = [...page.matchAll(/<script\b[^>]*data-canvas-module="[^"]+"[^>]*src="([^"?]+)[^"]*"[^>]*>/g)];
    if (scripts.length !== 8) throw new Error('Expected eight canvas task modules in the production page');
    const source = scripts.map(([, url]) => fs.readFileSync(path.join(root, url), 'utf8')).join('\n');
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? source : Buffer.from(source);
}

// Function-level legacy tests may inspect a private implementation without exposing
// it in production. Full-page browser tests cover the actual owner and lifecycle.
function functionSource(source, name) {
    const match = new RegExp(`^([ \\t]*)(?:async )?function ${name}\\(`, 'm').exec(source);
    if(!match) throw new Error(`Missing function ${name}`);
    const start=match.index, lineEnd=source.indexOf('\n',start);
    const firstLine=source.slice(start,lineEnd);
    const end=firstLine.trimEnd().endsWith('}') ? lineEnd : source.indexOf('\n'+match[1]+'}',start)+match[1].length+2;
    return source.slice(start,end).replace(new RegExp('^'+match[1], 'gm'),'');
}

module.exports = {readCanvasSource,functionSource};

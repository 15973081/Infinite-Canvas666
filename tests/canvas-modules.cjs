const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const root = path.resolve(__dirname, '..');

for(const [kind, entry] of [['classic','canvas'], ['smart','smart-canvas']]) {
    test(`${kind}: all eight production modules load before the entry without eager effects`, () => {
        const html=fs.readFileSync(path.join(root, 'static', entry+'.html'), 'utf8');
        const scripts=[...html.matchAll(/<script\b([^>]*data-canvas-module="([^"]+)"[^>]*)><\/script>/g)];
        assert.deepEqual(scripts.map(m=>m[2]),['document','session','workspace','library','media-editor','execution','results','app']);
        const context=vm.createContext({});
        for(const [index, script] of scripts.entries()) {
            const url=script[1].match(/src="([^"?]+)/)[1];
            assert.ok(!/\b(?:async|defer|type)=?/.test(script[1]),'preserve blocking classic-script startup');
            const file=path.join(root,url);
            const source=fs.readFileSync(file,'utf8');
            new vm.Script(source,{filename:file});
            if(index===7)continue;
            const before=new Map(Object.entries(context));
            vm.runInContext(source,context,{filename:file});
            for(const [name,value] of before)assert.equal(context[name],value,'duplicate module export: '+name);
            for(const [name,value] of Object.entries(context))assert.equal(typeof value,'function','eager state/effect: '+name);
        }
        // Parsing the complete group also catches conflicting lexical declarations.
        new vm.Script(readCanvasSource(path.join(root,'static/js',entry+'.js'),'utf8'));
        const focus=html.indexOf('src="/static/js/canvas-focus.js');
        assert.ok(focus>scripts.at(-1).index,'focus integration remains after the entry');
    });
}

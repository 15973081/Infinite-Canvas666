const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');
function functions(kind){
    const source=fs.readFileSync(`static/js/canvas/${kind}/${kind==='classic'?'canvas':'smart'}-results.js`,'utf8');
    const context={window:{}};vm.createContext(context);
    vm.runInContext(fs.readFileSync('static/js/canvas-core.js','utf8'),context);
    const name=kind==='classic'?'formatCostMicros':'formatSmartCost';
    vm.runInContext(functionSource(source,name)+'\n'+functionSource(source,'formatRunDuration'),context);
    return {cost:context[name],duration:context.formatRunDuration};
}
for(const kind of ['classic','smart']){
    test(`${kind} cost display preserves micro-units, coercion, six decimal places and signed values`,()=>{
        const {cost}=functions(kind);
        for(const [input,expected] of [[undefined,'¥0.00'],[null,'¥0.00'],['','¥0.00'],[0,'¥0.00'],[1,'¥0.000001'],[1234567,'¥1.234567'],['1000000','¥1.00'],[-1000000,'¥-1.00'],[1234567890,'¥1,234.56789'],['invalid','¥NaN'],[Infinity,'¥∞']]){
            // The currency symbol is a literal prefix, including negative values.
            assert.equal(cost(input),expected);
        }
    });
    test(`${kind} duration display retains its own rounding and minute style`,()=>{
        const {duration}=functions(kind);
        assert.equal(duration(59500),kind==='classic'?'1m 00s':'59s');
        assert.equal(duration(61000),kind==='classic'?'1m 01s':'1:01');
        assert.equal(duration(-1000),'0s');
    });
}

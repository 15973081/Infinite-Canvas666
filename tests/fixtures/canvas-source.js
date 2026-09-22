// Function-level browser fixtures read the same script group as the real page.
async function fetchCanvasSource(pageUrl = '/static/smart-canvas.html') {
    const response = await fetch(pageUrl);
    if (!response.ok) throw new Error('Unable to load canvas page');
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const scripts = [...page.querySelectorAll('script[data-canvas-module]')];
    if (scripts.length !== 8) throw new Error('Expected eight canvas task modules');
    const sources = await Promise.all(scripts.map(async script => {
        const result = await fetch(script.getAttribute('src'));
        if (!result.ok) throw new Error('Unable to load ' + script.getAttribute('src'));
        return result.text();
    }));
    return sources.join('\n');
}

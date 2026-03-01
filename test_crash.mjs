import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();

        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log('BROWSER EXCEPTION:', msg.text());
                msg.args().forEach(arg => console.log('ARG:', arg.toString()));
            }
        });

        page.on('pageerror', error => {
            console.log('UNHANDLED REJECTION/ERROR:', error.message);
            console.log(error.stack);
        });

        console.log('Navigating to Matrix...');
        await page.goto('http://127.0.0.1:4000/?token=7222aad34391f5e6a6a846ebbcb43ca3', { waitUntil: 'networkidle0' });

        console.log('Evaluating for specific crash message...');
        const crashText = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            const pre = document.querySelector('pre');
            if (h1 && h1.innerText.includes('CRITICAL RUNTIME EXCEPTION')) {
                return pre ? pre.innerText : 'Crash Screen Found without Pre';
            }
            return 'No Crash Screen detected';
        });

        console.log('\n--- CRASH DUMP ---');
        console.log(crashText);
        console.log('------------------\n');

        await browser.close();
    } catch (err) {
        console.error('Puppeteer Failed:', err);
    }
})();

import { JSDOM } from "jsdom";

const html = `
<body>
  <h3>1. Leitura</h3>
  <p>Detail 1</p>
  <div class="section">
    <h2>MINISTÉRIO</h2>
    <h3>2. Teste</h3>
  </div>
</body>
`;
const dom = new JSDOM(html);
const document = dom.window.document;

const headings = Array.from(document.querySelectorAll('h2, h3'));
for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i+1];
    
    if (heading.tagName === 'H3') {
        const range = document.createRange();
        range.setStartAfter(heading);
        if (nextHeading) {
            range.setEndBefore(nextHeading);
        } else {
            range.setEndAfter(document.body.lastChild);
        }
        const fragment = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(fragment);
        console.log(`Heading: ${heading.textContent}`);
        console.log(`Content: ${div.textContent.trim()}`);
        console.log('---');
    }
}

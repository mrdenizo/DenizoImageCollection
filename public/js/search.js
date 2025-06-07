import Autocomplete from "./autocomplete.js";

const options = {
    items: [],
    maximumItems: 10,
    startsWith: true,
    highlightTyped: true
}


document.querySelector("#search").addEventListener("input", (e) => {
    fetch('/api/v1/gettags', {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({tag: document.querySelector("#search").value})})
    .then(responce => responce.json())
    .then(responce => { 
        let items = [];
        Autocomplete.getInstance(document.querySelector('#search'))._items = [];
        for(let tag of responce) {
            items.push(tag.tag);
        }
        Autocomplete.getInstance(document.querySelector('#search'))._addItems(items);
    }); 
});

Autocomplete.init(`#search`, options);
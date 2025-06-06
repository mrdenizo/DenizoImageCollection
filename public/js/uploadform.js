addEventListener("submit", (e) => {
    if(e.target.id !== 'uploadform')
        return;
    if(/^\s*$/.test(document.querySelector("#tagsinput").value)) {
        document.querySelector("#tagsErrorMsg").classList.remove('d-none');
        e.preventDefault();   
    }
});
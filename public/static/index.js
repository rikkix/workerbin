
// function addProgressBar(file) {
//     const progressBar = document.createElement('div');
//     progressBar.innerHTML = `
//         <div class="mb-3">
//             <label for="pg-${file.name}" class="form-label">${file.name}</label>
//             <div class="progress">
//                 <div id="pg-${file.name}" class="progress-bar" role="progressbar" style="width: 0%;"
//                                 aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">0%</div>
//             </div>
//         </div>
//     `;
//     document.getElementById('progress-bars').appendChild(progressBar);
// }

// async function uploadFile(file) {
//     const formData = new FormData();
//     formData.append('file', file);

//     addProgressBar(file)
//     fetch('/api/upload', {
//         method: 'POST',
//         body: formData
//     })
// }

// document.onpaste = function (event) {
//     var items = (event.clipboardData || event.originalEvent.clipboardData).items;
//     for (index in items) {
//         var item = items[index];
//         if (item.kind === 'file') {
//             var blob = item.getAsFile();
//             uploadFile(blob);
//         }
//     }
// }
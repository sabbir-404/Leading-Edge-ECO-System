const fs = require('fs');
const path = require('path');
async function test() {
    const filePath = 'dummy.png';
    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer]);
    const formData = new FormData();
    formData.append('secret_key', 'LE_SOFT_SECURE_UPLOAD_KEY_2026');
    formData.append('image', blob, path.basename(filePath));
    const response = await fetch('https://leadingedge.com.bd/api/upload_image.php', { method: 'POST', body: formData });
    const data = await response.json();
    console.log(data);
}
test();

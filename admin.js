document.addEventListener('DOMContentLoaded', () => {
    // ─── Mode & Auth Configuration ──────────────────────────────
    const mode = localStorage.getItem('admin_mode') || 'server';
    const token = localStorage.getItem('admin_token');
    const ghToken = localStorage.getItem('gh_token');
    const ghRepo = localStorage.getItem('gh_repo');

    if (!token) {
        window.location.href = 'loginkota.html';
        return;
    }

    // ─── GitHub API Client ────────────────────────────────────────
    const github = {
        async request(path, options = {}) {
            const url = `https://api.github.com/repos/${ghRepo}/contents/${path}`;
            const headers = {
                'Authorization': `token ${ghToken}`,
                'Accept': 'application/vnd.github.v3+json',
                ...options.headers
            };
            const response = await fetch(url, { ...options, headers });
            if (response.status === 401) {
                alert('GitHub Token expired or invalid. Please login again.');
                localStorage.clear();
                window.location.href = 'loginkota.html';
            }
            return response;
        },
        async getFile(path) {
            const res = await this.request(path + '?t=' + Date.now()); // Cache bust
            if (!res.ok) return { content: null, sha: null };
            const data = await res.json();
            try {
                // Decode base64 to UTF-8
                const decoded = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
                return {
                    content: JSON.parse(decoded),
                    sha: data.sha
                };
            } catch (err) {
                console.error('Decoding/JSON error:', err);
                return { content: null, sha: data.sha };
            }
        },
        async updateFile(path, content, sha, message) {
            const body = {
                message,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
                sha
            };
            return this.request(path, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
        },
        async uploadImage(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async () => {
                    const base64 = reader.result.split(',')[1];
                    const filename = `images/${Date.now()}-${Math.floor(Math.random() * 1000)}.${file.name.split('.').pop()}`;
                    const res = await this.request(filename, {
                        method: 'PUT',
                        body: JSON.stringify({
                            message: `Upload image: ${file.name}`,
                            content: base64
                        })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        resolve(data.content.path);
                    } else {
                        reject('Image upload failed');
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
    };

    const authHeader = mode === 'server' ? { 'Authorization': token } : {};
    const uploadForm = document.getElementById('upload-form');
    const statusMsg = document.getElementById('status-message');
    const adminGrid = document.getElementById('admin-product-grid');
    const adminLoading = document.getElementById('admin-loading');
    const catSelect = document.getElementById('category');

    // ─── Category Management Logic ────────────────────────────────
    const loadCategories = async () => {
        try {
            let categories;
            if (mode === 'github') {
                const { content } = await github.getFile('categories.json');
                categories = content || ["embroidery", "block-print", "brush-paint", "screen-print"];
            } else {
                const res = await fetch('api/categories');
                categories = await res.json();
            }
            
            if (catSelect) {
                catSelect.innerHTML = categories.map(cat => 
                    `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}</option>`
                ).join('');
            }
        } catch (err) {
            console.error('Failed to load categories');
        }
    };

    const addCatUiBtn = document.getElementById('add-cat-ui-btn');
    const newCatPanel = document.getElementById('new-cat-panel');
    const submitNewCatBtn = document.getElementById('submit-new-cat');
    const newCatInput = document.getElementById('new-cat-name');

    if (addCatUiBtn) {
        addCatUiBtn.addEventListener('click', () => {
            newCatPanel.style.display = newCatPanel.style.display === 'none' ? 'block' : 'none';
        });
    }

    if (submitNewCatBtn) {
        submitNewCatBtn.addEventListener('click', async () => {
            const name = newCatInput.value.trim();
            if (!name) return alert('Enter a category name');
            const safeName = name.toLowerCase().replace(/\s+/g, '-');

            try {
                if (mode === 'github') {
                    const { content, sha } = await github.getFile('categories.json');
                    const categories = content || [];
                    if (categories.includes(safeName)) return alert('Category exists');
                    categories.push(safeName);
                    const res = await github.updateFile('categories.json', categories, sha, `Add category: ${safeName}`);
                    if (res.ok) {
                        await loadCategories();
                        newCatInput.value = '';
                        newCatPanel.style.display = 'none';
                    }
                } else {
                    const res = await fetch('api/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeader },
                        body: JSON.stringify({ name })
                    });
                    const result = await res.json();
                    if (res.ok && result.success) {
                        await loadCategories();
                        newCatInput.value = '';
                        newCatPanel.style.display = 'none';
                        catSelect.value = result.category;
                    }
                }
            } catch (err) {
                alert('Error adding category');
            }
        });
    }

    loadCategories();

    const showMessage = (msg, isError = false) => {
        statusMsg.textContent = msg;
        statusMsg.style.display = 'block';
        statusMsg.style.backgroundColor = isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)';
        statusMsg.style.color = isError ? '#fca5a5' : '#86efac';
        statusMsg.style.border = `1px solid ${isError ? '#ef4444' : '#22c55e'}`;
    };

    // ─── Load & Render Products ──────────────────────────────
    const loadAdminProducts = async () => {
        try {
            let products;
            if (mode === 'github') {
                const { content } = await github.getFile('data.json');
                products = content || [];
            } else {
                const res = await fetch('api/products', { headers: authHeader });
                products = await res.json();
            }
            
            adminLoading.style.display = 'none';
            if (products.length === 0) {
                adminGrid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1/-1;">No products yet.</p>';
                return;
            }

            adminGrid.innerHTML = '';
            products.forEach(product => {
                const coverImg = product.images && product.images.length > 0 ? product.images[0] : '';
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.id = product.id;
                card.innerHTML = `
                    <div class="card-img-wrapper" style="height: auto; min-height: unset; background: #eee;">
                        <img src="${coverImg}" alt="${product.title}" class="main-img" style="width: 100%; height: auto; object-fit: contain; max-height: 250px;">
                        <span class="card-category-badge">${product.category.replace('-', ' ')}</span>
                    </div>
                    <div class="card-content">
                        <div class="card-header">
                            <h3 class="card-title" style="font-size: 1rem;">${product.title}</h3>
                            <span class="card-price">₹${product.price}</span>
                        </div>
                        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 1rem;">${product.images ? product.images.length : 0} photo(s)</p>
                        <div class="card-actions" style="display: flex; gap: 0.5rem; justify-content: space-between;">
                            <button class="edit-btn" data-id="${product.id}" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); padding: 0.5rem; border-radius: 6px; cursor: pointer; color: white; flex: 1; transition: background 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">✏️ Edit</button>
                            <button class="delete-btn" data-id="${product.id}" style="flex: 1; padding: 0.5rem; border-radius: 6px; cursor: pointer; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; transition: background 0.3s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'">🗑️ Delete</button>
                        </div>
                    </div>
                `;
                adminGrid.appendChild(card);
            });

            adminGrid.querySelectorAll('.delete-btn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    if (!confirm("Delete product?")) return;
                    btn.disabled = true;
                    btn.textContent = 'Deleting...';

                    try {
                        if (mode === 'github') {
                            const { content, sha } = await github.getFile('data.json');
                            const updated = content.filter(p => p.id !== id);
                            const res = await github.updateFile('data.json', updated, sha, `Delete product ID: ${id}`);
                            if (res.ok) btn.closest('.product-card').remove();
                        } else {
                            const res = await fetch(`api/products/${id}`, { method: 'DELETE', headers: authHeader });
                            if (res.ok) btn.closest('.product-card').remove();
                        }
                    } catch (err) {
                        alert('Delete failed');
                        btn.disabled = false;
                        btn.textContent = '🗑️ Delete Product';
                    }
                };
            });
            adminGrid.querySelectorAll('.edit-btn').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.id;
                    const product = products.find(p => p.id === id);
                    if (product) {
                        document.getElementById('edit-id').value = product.id;
                        document.getElementById('edit-title').value = product.title || '';
                        document.getElementById('edit-price').value = product.price || '';
                        document.getElementById('edit-description').value = product.description || '';

                        // Populate edit-category with options and select the correct one
                        const editCatSelect = document.getElementById('edit-category');
                        editCatSelect.innerHTML = catSelect.innerHTML;
                        if (product.category) editCatSelect.value = product.category;

                        // Render existing photos with delete buttons
                        renderEditPhotos(product.images || []);

                        // Clear any previously selected new files
                        const newImgInput = document.getElementById('edit-new-images');
                        if (newImgInput) newImgInput.value = '';

                        document.getElementById('edit-modal').style.display = 'flex';
                    }
                };
            });
        } catch (err) {
            adminLoading.textContent = 'Error loading products.';
        }
    };

    loadAdminProducts();

    // ─── Upload Form Submit ───────────────────────────────────────
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        const productData = {
            title: document.getElementById('title').value,
            price: document.getElementById('price').value,
            category: document.getElementById('category').value,
            description: document.getElementById('description').value,
            id: Date.now().toString()
        };

        try {
            if (mode === 'github') {
                const files = document.getElementById('images').files;
                const uploadedPaths = [];
                for (let i = 0; i < files.length; i++) {
                    submitBtn.textContent = `Uploading Image ${i+1}/${files.length}...`;
                    const path = await github.uploadImage(files[i]);
                    uploadedPaths.push(path);
                }
                
                submitBtn.textContent = 'Updating Catalog...';
                const { content, sha } = await github.getFile('data.json');
                const products = content || [];
                products.unshift({ ...productData, images: uploadedPaths });
                const res = await github.updateFile('data.json', products, sha, `Add product: ${productData.title}`);
                
                if (res.ok) {
                    showMessage('✅ Added to GitHub Catalog!');
                    uploadForm.reset();
                    loadAdminProducts();
                }
            } else {
                const formData = new FormData(uploadForm);
                const res = await fetch('api/upload', { method: 'POST', headers: authHeader, body: formData });
                if (res.ok) {
                    showMessage('✅ Added to Server Catalog!');
                    uploadForm.reset();
                    loadAdminProducts();
                }
            }
        } catch (err) {
            showMessage('❌ Upload failed', true);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Product to Catalog';
        }
    });

    document.getElementById('logout-btn').onclick = () => {
        localStorage.clear();
        window.location.href = 'login.html';
    };

    // ─── AI Image Generation (Gemini) ────────────────────────────────
    const BASE_PROMPT = `Use the uploaded images as the exact base reference. Keep the fabric, print, colors, motifs, and pattern placement 100% identical. Do NOT redesign or generate a new pattern.
Enhance only the finishing and presentation:
- Improve fabric clarity, sharpness, and texture
- Make folds clean, neat, and professionally arranged
- Maintain natural fabric fall and softness
- Keep everything realistic and true to original
Create a luxury boutique catalog display of a traditional Indian dress material (unstitched):
- Display on a wooden hanger
- Shirt fabric neatly folded
- Dupatta elegantly draped (same as original, no modification)
- Background: soft beige studio setup
- Add minimal prop: small green plant in ceramic pot on wooden block
- Lighting: soft, diffused studio lighting with natural shadows
- Ultra-realistic, high resolution, sharp focus, e-commerce style.`;

    // Load persisted API key
    const aiApiKeyInput = document.getElementById('ai-api-key');
    if (aiApiKeyInput) {
        const savedKey = localStorage.getItem('hf_api_key');
        if (savedKey) aiApiKeyInput.value = savedKey;

        aiApiKeyInput.addEventListener('change', () => {
            if (aiApiKeyInput.value.trim()) {
                localStorage.setItem('hf_api_key', aiApiKeyInput.value.trim());
            }
        });
    }

    let aiGeneratedBlob = null; // stores the generated image blob

    const generateBtn = document.getElementById('generate-ai-img-btn');
    const aiResultPanel = document.getElementById('ai-result-panel');
    const aiResultImg = document.getElementById('ai-result-img');
    const useAiImgBtn = document.getElementById('use-ai-img-btn');
    const discardAiImgBtn = document.getElementById('discard-ai-img-btn');

    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const apiKey = aiApiKeyInput.value.trim();
            if (!apiKey) {
                alert('Please enter your Hugging Face Token first.');
                aiApiKeyInput.focus();
                return;
            }

            const imagesInput = document.getElementById('images');
            if (!imagesInput || imagesInput.files.length === 0) {
                alert('Please select at least one product photo first.');
                imagesInput.focus();
                return;
            }

            // Save the token
            localStorage.setItem('hf_api_key', apiKey);

            const file = imagesInput.files[0]; // use first selected image

            // Convert image to base64
            const toBase64 = (f) => new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result.split(',')[1]);
                reader.onerror = rej;
                reader.readAsDataURL(f);
            });

            generateBtn.disabled = true;
            generateBtn.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span> Generating (~30s)...`;

            // Add spin animation if not present
            if (!document.getElementById('spin-style')) {
                const style = document.createElement('style');
                style.id = 'spin-style';
                style.textContent = `@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`;
                document.head.appendChild(style);
            }

            try {
                const imageBase64 = await toBase64(file);
                const mimeType = file.type || 'image/jpeg';
                const customPrompt = document.getElementById('ai-prompt').value.trim();
                const fullPrompt = customPrompt ? `${BASE_PROMPT}\n${customPrompt}` : BASE_PROMPT;

                // Official Hugging Face Inference API for image-to-image
                // Model: timbrooks/instruct-pix2pix
                const response = await fetch(
                    'https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`,
                            'x-use-cache': 'false',
                            'x-wait-for-model': 'true' // Wait if model is loading
                        },
                        body: JSON.stringify({
                            inputs: imageBase64,
                            parameters: {
                                prompt: fullPrompt
                            }
                        })
                    }
                );

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(errText || `HTTP ${response.status}`);
                }

                // Hugging Face returns the physical image bytes directly
                aiGeneratedBlob = await response.blob();

                // Show preview
                const objectUrl = URL.createObjectURL(aiGeneratedBlob);
                aiResultImg.src = objectUrl;
                aiResultPanel.style.display = 'flex';
                aiResultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            } catch (err) {
                alert(`❌ AI Generation Failed:\n${err.message}`);
                console.error('Hugging Face API error:', err);
            } finally {
                generateBtn.disabled = false;
                generateBtn.innerHTML = '✨ Enhance Uploaded Image';
            }
        });
    }

    // ─── "Add to Product" button handler ────────────────────────
    if (useAiImgBtn) {
        useAiImgBtn.addEventListener('click', () => {
            if (!aiGeneratedBlob) return;

            // Create a File from the blob to inject into the images input
            const ext = aiGeneratedBlob.type.split('/')[1] || 'png';
            const aiFile = new File([aiGeneratedBlob], `ai-enhanced-${Date.now()}.${ext}`, { type: aiGeneratedBlob.type });

            const imagesInput = document.getElementById('images');
            const dt = new DataTransfer();

            // Keep existing files + add AI file
            for (const f of imagesInput.files) {
                dt.items.add(f);
            }
            dt.items.add(aiFile);
            imagesInput.files = dt.files;

            // Visual confirmation
            useAiImgBtn.textContent = '✅ Added!';
            useAiImgBtn.style.background = 'rgba(34, 197, 94, 0.4)';
            setTimeout(() => {
                useAiImgBtn.textContent = 'Add to Product';
                useAiImgBtn.style.background = 'rgba(34, 197, 94, 0.2)';
            }, 2000);
        });
    }

    if (discardAiImgBtn) {
        discardAiImgBtn.addEventListener('click', () => {
            aiGeneratedBlob = null;
            aiResultImg.src = '';
            aiResultPanel.style.display = 'none';
        });
    }

    // ─── Edit Modal Logic ─────────────────────────────────────────
    const editModal = document.getElementById('edit-modal');
    let editDeletedPhotos = []; // tracks photo paths marked for deletion

    const renderEditPhotos = (images) => {
        const grid = document.getElementById('edit-photos-grid');
        const countBadge = document.getElementById('edit-photo-count');
        editDeletedPhotos = [];
        grid.innerHTML = '';

        const alive = images || [];
        countBadge.textContent = `${alive.length} photo${alive.length !== 1 ? 's' : ''}`;

        if (alive.length === 0) {
            grid.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem; grid-column: 1/-1;">No photos yet.</p>`;
            return;
        }

        alive.forEach((src, idx) => {
            const wrap = document.createElement('div');
            wrap.dataset.src = src;
            wrap.style.cssText = `position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--glass-border); aspect-ratio: 1; background: #111;`;

            const img = document.createElement('img');
            // For GitHub mode, construct the raw URL if it's a repo path
            const imgSrc = src.startsWith('http') ? src : `https://raw.githubusercontent.com/${ghRepo}/main/${src}`;
            img.src = imgSrc;
            img.alt = `Photo ${idx + 1}`;
            img.style.cssText = `width: 100%; height: 100%; object-fit: cover; display: block; transition: opacity 0.3s;`;

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.innerHTML = '✕';
            delBtn.title = 'Remove this photo';
            delBtn.style.cssText = `
                position: absolute; top: 4px; right: 4px;
                background: rgba(239,68,68,0.85); color: white;
                border: none; border-radius: 50%; width: 24px; height: 24px;
                cursor: pointer; font-size: 0.8rem; font-weight: 700;
                display: grid; place-items: center; line-height: 1;
                transition: transform 0.15s, background 0.2s;
                backdrop-filter: blur(4px);
            `;
            delBtn.onmouseover = () => { delBtn.style.transform = 'scale(1.15)'; delBtn.style.background = 'rgba(239,68,68,1)'; };
            delBtn.onmouseout  = () => { delBtn.style.transform = 'scale(1)';    delBtn.style.background = 'rgba(239,68,68,0.85)'; };

            delBtn.onclick = () => {
                editDeletedPhotos.push(src);
                wrap.style.opacity = '0';
                wrap.style.pointerEvents = 'none';
                setTimeout(() => wrap.remove(), 300);
                // Update count badge
                const remaining = grid.querySelectorAll('[data-src]').length - editDeletedPhotos.length;
                countBadge.textContent = `${remaining} photo${remaining !== 1 ? 's' : ''}`;
            };

            wrap.appendChild(img);
            wrap.appendChild(delBtn);
            grid.appendChild(wrap);
        });
    };

    if (editModal) {
        document.getElementById('close-edit-modal').onclick = () => {
            editModal.style.display = 'none';
        };

        // Close on outside click
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) editModal.style.display = 'none';
        });

        document.getElementById('edit-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-edit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            const id = document.getElementById('edit-id').value;
            const updatedData = {
                title: document.getElementById('edit-title').value,
                price: document.getElementById('edit-price').value,
                category: document.getElementById('edit-category').value,
                description: document.getElementById('edit-description').value
            };

            try {
                if (mode === 'github') {
                    const { content, sha } = await github.getFile('data.json');
                    const products = content || [];
                    const index = products.findIndex(p => p.id === id);

                    if (index !== -1) {
                        // 1. Start from existing images, remove deleted ones
                        let currentImages = products[index].images || [];
                        currentImages = currentImages.filter(img => !editDeletedPhotos.includes(img));

                        // 2. Upload any new photos
                        const newFilesInput = document.getElementById('edit-new-images');
                        if (newFilesInput && newFilesInput.files.length > 0) {
                            const files = newFilesInput.files;
                            for (let i = 0; i < files.length; i++) {
                                submitBtn.textContent = `Uploading photo ${i + 1}/${files.length}...`;
                                const path = await github.uploadImage(files[i]);
                                currentImages.push(path);
                            }
                        }

                        // 3. Save product with updated images + fields
                        products[index] = { ...products[index], ...updatedData, images: currentImages };
                        submitBtn.textContent = 'Saving to GitHub...';
                        const res = await github.updateFile('data.json', products, sha, `Update product ID: ${id}`);

                        if (res.ok) {
                            showMessage('✅ Product updated successfully!');
                            editModal.style.display = 'none';
                            loadAdminProducts();
                        } else {
                            throw new Error('GitHub update failed');
                        }
                    }
                } else {
                    // Server mode: handle multipart
                    const newFilesInput = document.getElementById('edit-new-images');
                    const formData = new FormData();
                    formData.append('title', updatedData.title);
                    formData.append('price', updatedData.price);
                    formData.append('category', updatedData.category);
                    formData.append('description', updatedData.description);
                    formData.append('deletedPhotos', JSON.stringify(editDeletedPhotos));
                    if (newFilesInput) {
                        for (const f of newFilesInput.files) formData.append('images', f);
                    }

                    const res = await fetch(`api/products/${id}`, {
                        method: 'PUT',
                        headers: authHeader,
                        body: formData
                    });

                    if (res.ok) {
                        showMessage('✅ Product updated successfully!');
                        editModal.style.display = 'none';
                        loadAdminProducts();
                    } else {
                        throw new Error('Update failed');
                    }
                }
            } catch (err) {
                alert('Error updating product: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '💾 Save Changes';
            }
        });
    }
});

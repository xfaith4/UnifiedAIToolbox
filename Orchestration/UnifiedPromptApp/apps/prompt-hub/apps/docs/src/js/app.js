document.addEventListener('DOMContentLoaded', () => {
    const promptContainer = document.getElementById('prompt-container');
    const searchInput = document.getElementById('search-input');
    const clearButton = document.getElementById('clear-search');
    const addPromptBtn = document.getElementById('add-prompt-btn');
    const exportBtn = document.getElementById('export-prompts-btn');
    const modal = document.getElementById('add-prompt-modal');
    const modalClose = document.getElementById('modal-close');
    const notificationBanner = document.getElementById('notification-banner');
    const notificationClose = document.getElementById('close-notification');
    const categorySelectEl = document.getElementById('prompt-category');
    const newCategoryInput = document.getElementById('new-category-input');
    const groupSelectEl = document.getElementById('prompt-group');
    const newGroupInput = document.getElementById('new-group-input');
    let allPrompts = { categories: [] };

    // Show loading state
    promptContainer.innerHTML = '<div class="loading">Loading prompts...</div>';

    fetch('prompts.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            allPrompts = data || {};
            if (!Array.isArray(allPrompts.categories)) {
                allPrompts.categories = [];
            }
            renderPrompts(allPrompts);
            populateCategoryDropdown();
            populateGroupDropdown();
        })
        .catch(error => {
            console.error('Error loading prompts:', error);
            promptContainer.innerHTML = `<div class="error">Failed to load prompts: ${error.message}</div>`;
            allPrompts = { categories: [] };
            populateCategoryDropdown();
            populateGroupDropdown();
        });

    if (notificationBanner && notificationClose) {
        notificationBanner.classList.remove('hidden');
        notificationClose.addEventListener('click', () => {
            notificationBanner.classList.add('hidden');
        });
    }

    function createOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function getGroupedCategories(categories = []) {
        const groups = new Map();
        categories.forEach(category => {
            const groupName = category.group || 'Other Prompts';
            if (!groups.has(groupName)) {
                groups.set(groupName, []);
            }
            groups.get(groupName).push(category);
        });
        return groups;
    }

    function getCategoryByName(name) {
        return allPrompts.categories.find(cat => cat.name === name);
    }

    function renderPrompts(dataObj, searchTerm = '') {
        // Clear loading state
        promptContainer.innerHTML = '';

        const categories = Array.isArray(dataObj?.categories) ? dataObj.categories : [];

        if (categories.length === 0) {
            promptContainer.innerHTML = '<div class="error">No prompts found.</div>';
            return;
        }

        let hasResults = false;

        const groups = getGroupedCategories(categories);

        groups.forEach((groupCategories, groupName) => {
            const groupSection = document.createElement('section');
            groupSection.className = 'group-section';

            const groupTitle = document.createElement('h2');
            groupTitle.className = 'group-title';
            groupTitle.textContent = groupName;
            groupSection.appendChild(groupTitle);

            let groupHasResults = false;

            groupCategories.forEach(category => {
                const filteredPrompts = category.prompts ? category.prompts.filter(prompt => {
                    if (!searchTerm) return true;
                    const term = searchTerm.toLowerCase();
                    return prompt.title.toLowerCase().includes(term) ||
                           prompt.description.toLowerCase().includes(term) ||
                           prompt.prompt.toLowerCase().includes(term);
                }) : [];

                if (filteredPrompts.length === 0) {
                    return;
                }

                groupHasResults = true;
                const categorySection = document.createElement('section');
                categorySection.className = 'category-section';

                const categoryTitle = document.createElement('h2');
                categoryTitle.textContent = category.name;
                if (searchTerm) {
                    categoryTitle.innerHTML += ` <span class="result-count">(${filteredPrompts.length} result${filteredPrompts.length !== 1 ? 's' : ''})</span>`;
                }
                categorySection.appendChild(categoryTitle);

                filteredPrompts.forEach(prompt => {
                    const card = document.createElement('div');
                    card.className = 'prompt-card';

                    const title = document.createElement('h3');
                    title.textContent = prompt.title;

                    const description = document.createElement('p');
                    description.textContent = prompt.description;
                    description.className = 'prompt-description';

                    const pre = document.createElement('pre');
                    const code = document.createElement('code');
                    code.textContent = prompt.prompt;
                    pre.appendChild(code);

                    const copyButton = document.createElement('button');
                    copyButton.textContent = 'Copy Prompt';
                    copyButton.className = 'copy-button';
                    copyButton.onclick = () => {
                        navigator.clipboard.writeText(prompt.prompt).then(() => {
                            copyButton.textContent = 'Copied!';
                            copyButton.classList.add('copied');
                            setTimeout(() => {
                                copyButton.textContent = 'Copy Prompt';
                                copyButton.classList.remove('copied');
                            }, 2000);
                        }).catch(err => {
                            console.error('Failed to copy: ', err);
                            copyButton.textContent = 'Copy Failed';
                            setTimeout(() => {
                                copyButton.textContent = 'Copy Prompt';
                            }, 2000);
                        });
                    };

                    card.appendChild(title);
                    card.appendChild(description);
                    card.appendChild(pre);
                    card.appendChild(copyButton);
                    categorySection.appendChild(card);
                });

                groupSection.appendChild(categorySection);
            });

            if (groupHasResults) {
                hasResults = true;
                promptContainer.appendChild(groupSection);
            }
        });

        if (!hasResults && searchTerm) {
            promptContainer.innerHTML = `<div class="no-results">No prompts found for "${searchTerm}". Try a different search term.</div>`;
        }
    }

    function populateCategoryDropdown() {
        if (!categorySelectEl) {
            return;
        }

        const baseOptions = [
            createOption('', 'Select a category'),
            createOption('new', '+ Create New Category')
        ];

        categorySelectEl.innerHTML = '';
        baseOptions.forEach(option => categorySelectEl.appendChild(option));

        const groups = getGroupedCategories(allPrompts.categories);
        groups.forEach((categories, groupName) => {
            const optGroup = document.createElement('optgroup');
            optGroup.label = groupName;
            categories.forEach(category => {
                const option = createOption(category.name, category.name);
                option.dataset.group = groupName;
                optGroup.appendChild(option);
            });
            categorySelectEl.appendChild(optGroup);
        });
    }

    function populateGroupDropdown() {
        if (!groupSelectEl) {
            return;
        }

        const baseOptions = [
            createOption('', 'Select a group'),
            createOption('new', '+ Create New Group')
        ];

        groupSelectEl.innerHTML = '';
        baseOptions.forEach(option => groupSelectEl.appendChild(option));

        const groups = Array.from(getGroupedCategories(allPrompts.categories).keys());
        groups.sort((a, b) => a.localeCompare(b));
        groups.forEach(groupName => {
            groupSelectEl.appendChild(createOption(groupName, groupName));
        });
    }

    function ensureToggleInputHidden(inputEl) {
        if (inputEl) {
            inputEl.classList.remove('show');
            inputEl.value = '';
            inputEl.required = false;
        }
    }

    // Modal functionality
    function openModal() {
        modal.classList.remove('hidden');
        populateCategoryDropdown();
        populateGroupDropdown();
        if (groupSelectEl) {
            groupSelectEl.disabled = false;
            groupSelectEl.value = '';
        }
        ensureToggleInputHidden(newCategoryInput);
        ensureToggleInputHidden(newGroupInput);
    }

    function closeModal() {
        modal.classList.add('hidden');
        resetForm();
    }

    function resetForm() {
        document.getElementById('prompt-form').reset();
        document.getElementById('json-input').value = '';
        ensureToggleInputHidden(newCategoryInput);
        ensureToggleInputHidden(newGroupInput);
        if (groupSelectEl) {
            groupSelectEl.disabled = false;
            groupSelectEl.value = '';
        }
        // Switch back to form tab
        switchTab('form');
        // Clear any messages
        clearMessages();
    }

    function switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    function showMessage(message, type = 'success') {
        clearMessages();
        const messageDiv = document.createElement('div');
        messageDiv.className = `${type}-message`;
        messageDiv.textContent = message;

        const activeTab = document.querySelector('.tab-content.active');
        activeTab.insertBefore(messageDiv, activeTab.firstChild);
    }

    function clearMessages() {
        document.querySelectorAll('.success-message, .error-message').forEach(msg => msg.remove());
    }

    function addPromptToData(newPrompt, categoryName, groupName, options = {}) {
        const { suppressFeedback = false } = options;
        // Find existing category or create new one
        let targetCategory = getCategoryByName(categoryName);

        if (!targetCategory) {
            if (!groupName) {
                throw new Error('A group name is required when creating a new category.');
            }
            targetCategory = {
                name: categoryName,
                group: groupName,
                prompts: []
            };
            allPrompts.categories.push(targetCategory);
        } else if (groupName && !targetCategory.group) {
            targetCategory.group = groupName;
        }

        // Add the new prompt
        targetCategory.prompts.push(newPrompt);

        // Re-render the prompts
        const currentSearchTerm = searchInput.value.trim();
        renderPrompts(allPrompts, currentSearchTerm);
        populateCategoryDropdown();
        populateGroupDropdown();

        if (!suppressFeedback) {
            showMessage('Prompt added successfully! Note: This is only stored locally in your browser session.');
            setTimeout(() => {
                closeModal();
            }, 2000);
        }
    }

    function exportPromptsAsJSON() {
        const dataStr = JSON.stringify(allPrompts, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `prompts-library-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the URL object
        URL.revokeObjectURL(link.href);
    }

    // Event listeners
    addPromptBtn.addEventListener('click', openModal);
    exportBtn.addEventListener('click', exportPromptsAsJSON);
    modalClose.addEventListener('click', closeModal);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });
    });

    // Category dropdown change handler
    if (categorySelectEl) {
        categorySelectEl.addEventListener('change', (e) => {
            if (e.target.value === 'new') {
                newCategoryInput.classList.add('show');
                newCategoryInput.required = true;
                if (groupSelectEl) {
                    groupSelectEl.disabled = false;
                    groupSelectEl.value = '';
                }
            } else {
                ensureToggleInputHidden(newCategoryInput);
                const selectedCategory = getCategoryByName(e.target.value);
                if (selectedCategory && groupSelectEl) {
                    groupSelectEl.disabled = true;
                    groupSelectEl.value = selectedCategory.group || '';
                    ensureToggleInputHidden(newGroupInput);
                }
            }
        });
    }

    if (groupSelectEl) {
        groupSelectEl.addEventListener('change', (e) => {
            if (e.target.value === 'new') {
                newGroupInput.classList.add('show');
                newGroupInput.required = true;
            } else {
                ensureToggleInputHidden(newGroupInput);
            }
        });
    }

    // Form submission
    document.getElementById('prompt-form').addEventListener('submit', (e) => {
        e.preventDefault();

        const title = document.getElementById('prompt-title').value.trim();
        const description = document.getElementById('prompt-description').value.trim();
        const content = document.getElementById('prompt-content').value.trim();

        let categoryName;
        let groupName;

        if (categorySelectEl.value === 'new') {
            categoryName = newCategoryInput.value.trim();
            if (!categoryName) {
                showMessage('Please enter a category name.', 'error');
                return;
            }
            if (!groupSelectEl.value || groupSelectEl.value === 'new') {
                groupName = newGroupInput.value.trim();
                if (!groupName) {
                    showMessage('Please enter a group name.', 'error');
                    return;
                }
            } else {
                groupName = groupSelectEl.value;
            }
        } else {
            categoryName = categorySelectEl.value;
            const existingCategory = getCategoryByName(categoryName);
            groupName = existingCategory ? existingCategory.group : undefined;
        }

        if (!title || !description || !content) {
            showMessage('Please fill in all required fields.', 'error');
            return;
        }

        const newPrompt = {
            title: title,
            description: description,
            prompt: content
        };

        addPromptToData(newPrompt, categoryName, groupName);
    });

    // JSON upload functionality
    document.getElementById('add-json').addEventListener('click', () => {
        const jsonInput = document.getElementById('json-input').value.trim();

        if (!jsonInput) {
            showMessage('Please enter JSON content.', 'error');
            return;
        }

        try {
            const parsedData = JSON.parse(jsonInput);
            const entries = Array.isArray(parsedData) ? parsedData : [parsedData];

            if (entries.length === 0) {
                showMessage('JSON does not contain any prompt data.', 'error');
                return;
            }

            let addedCount = 0;

            entries.forEach(entry => {
                if (!entry.title || !entry.description || !entry.prompt) {
                    throw new Error('Each prompt must include title, description, and prompt fields.');
                }

                const categoryName = entry.category || 'Uncategorized';
                const existingCategory = getCategoryByName(categoryName);
                const groupName = existingCategory ? existingCategory.group : (entry.group || 'Imported Prompts');

                const newPrompt = {
                    title: entry.title,
                    description: entry.description,
                    prompt: entry.prompt
                };

                addPromptToData(newPrompt, categoryName, groupName, { suppressFeedback: true });
                addedCount += 1;
            });

            showMessage(`${addedCount} prompt${addedCount !== 1 ? 's' : ''} added successfully. Remember to export to save permanently.`);
            setTimeout(() => {
                closeModal();
            }, 2000);
        } catch (error) {
            console.error('JSON upload error:', error);
            showMessage(error.message || 'Invalid JSON format. Please check your syntax.', 'error');
        }
    });

    // Cancel buttons
    document.getElementById('cancel-form').addEventListener('click', closeModal);
    document.getElementById('cancel-json').addEventListener('click', closeModal);

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim();
        renderPrompts(allPrompts, searchTerm);
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        renderPrompts(allPrompts);
    });

    // Allow Enter key to trigger search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const searchTerm = e.target.value.trim();
            renderPrompts(allPrompts, searchTerm);
        }
    });
});

const searchInput = document.querySelector('#search');
const categorySelect = document.querySelector('#category');
const resultsHost = document.querySelector('#results');
const template = document.querySelector('#prompt-card');

let promptCache = [];

async function loadPrompts() {
  const response = await fetch('./prompts.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load prompts.json');
  }

  const payload = await response.json();
  promptCache = payload.prompts ?? [];
  populateCategories();
  render();
}

function populateCategories() {
  const categories = Array.from(new Set(promptCache.map((p) => p.category))).sort();
  categorySelect.innerHTML = '';

  const anyOption = document.createElement('option');
  anyOption.value = '';
  anyOption.textContent = 'All categories';
  categorySelect.appendChild(anyOption);

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

function createCard(prompt) {
  const node = template.content.cloneNode(true);
  node.querySelector('h2').textContent = prompt.title;
  node.querySelector('.prompt-card__meta').textContent = `${prompt.id} • ${prompt.category}`;
  node.querySelector('.prompt-card__description').textContent = prompt.description;
  node.querySelector('.prompt-card__preview').textContent = prompt.preview;
  return node;
}

function render() {
  const query = searchInput.value?.toLowerCase() ?? '';
  const category = categorySelect.value;
  const filtered = promptCache.filter((prompt) => {
    const matchesCategory = !category || prompt.category === category;
    const matchesQuery =
      !query ||
      prompt.title.toLowerCase().includes(query) ||
      prompt.description.toLowerCase().includes(query) ||
      prompt.id.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  resultsHost.innerHTML = '';
  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No prompts matched the current filters.';
    resultsHost.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((prompt) => fragment.appendChild(createCard(prompt)));
  resultsHost.appendChild(fragment);
}

searchInput.addEventListener('input', () => render());
categorySelect.addEventListener('change', () => render());

loadPrompts().catch((err) => {
  resultsHost.innerHTML = `<p class="error">Failed to load prompt index: ${err.message}</p>`;
});

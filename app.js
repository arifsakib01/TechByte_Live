// Application State
const state = {
    news: [],
    loading: false,
    error: false,
    lastUpdated: null,
    currentFilter: 'all',
    updateInterval: 60,
    countdown: 60,
    timerId: null,
    isFetching: false
};

// We use api.rss2json.com to convert public RSS feeds directly to JSON
const proxyUrl = 'https://api.rss2json.com/v1/api.json?rss_url=';

const feedSources = {
    all: [
        { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
        { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
        { name: 'Toms Hardware', url: 'https://www.tomshardware.com/feeds/all' },
        { name: 'Android Auth', url: 'https://www.androidauthority.com/feed/' },
        { name: 'Space.com', url: 'https://www.space.com/feeds/all' }
    ],
    smartphones: [
        { name: 'Android Auth', url: 'https://www.androidauthority.com/feed/' },
        { name: '9to5Mac', url: 'https://9to5mac.com/feed/' },
        { name: 'GSMArena', url: 'https://www.gsmarena.com/rss-news-reviews.php3' }
    ],
    software: [
        { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
        { name: 'Dev.to', url: 'https://dev.to/feed' },
        { name: 'GitHub Blog', url: 'https://github.blog/feed/' }
    ],
    hardware: [
        { name: 'Toms Hardware', url: 'https://www.tomshardware.com/feeds/all' },
        { name: 'AnandTech', url: 'https://feeds.arstechnica.com/arstechnica/index' },
        { name: 'PC Gamer', url: 'https://www.pcgamer.com/rss/' }
    ],
    spacetech: [
        { name: 'Space.com', url: 'https://www.space.com/feeds/all' },
        { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
        { name: 'Universe Today', url: 'https://www.universetoday.com/feed/' }
    ]
};

// DOM Element References
const elements = {
    grid: document.getElementById('news-grid'),
    loader: document.getElementById('loader'),
    error: document.getElementById('error-message'),
    lastUpdatedTime: document.getElementById('last-updated-time'),
    countdownTimer: document.getElementById('countdown-timer'),
    refreshBtn: document.getElementById('refresh-btn'),
    statusIndicator: document.getElementById('update-status'),
    filters: document.getElementById('category-filters'),
    statusParent: document.querySelector('.status-indicator'),
    modal: document.getElementById('disqus-modal'),
    closeModalBtn: document.getElementById('close-modal'),
    modalTitle: document.getElementById('modal-title')
};

// --- Utilities ---

// Converts standard dates to "X mins ago" format
const timeAgo = (date) => {
    if (!date || isNaN(date)) return "Unknown";
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return "< 1m";
    
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return interval + "y";
    
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return interval + "mo";
    
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return interval + "d";
    
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return interval + "h";
    
    interval = Math.floor(seconds / 60);
    return interval + "m";
};

// Clean text by stripping HTML tags
const stripHtml = (html) => {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
};

// --- Core Logic ---

// Fetches and parses a single RSS feed source using rss2json API
const fetchFeed = async (source) => {
    try {
        const response = await fetch(`${proxyUrl}${encodeURIComponent(source.url)}`);
        if (!response.ok) throw new Error('API responded with non-200 status');
        
        const data = await response.json();
        if (data.status !== 'ok') throw new Error('API returned an error');

        const items = (data.items || []).slice(0, 8); 
        
        return items.map(item => {
            // Find best image
            let img = item.thumbnail || (item.enclosure && item.enclosure.link) || '';
            if (!img) {
                const imgMatch = (item.description || item.content || '').match(/<img[^>]+src="([^">]+)"/);
                if (imgMatch) {
                    img = imgMatch[1];
                } else {
                    const hash = Math.abs((item.title || "").split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0));
                    img = `https://picsum.photos/seed/${hash}/500/300`;
                }
            }

            return {
                title: stripHtml(item.title || 'No Title'),
                description: stripHtml(item.description || item.content || ''),
                link: item.link || '#',
                pubDate: item.pubDate ? new Date(item.pubDate.replace(/-/g, '/')) : new Date(),
                source: source.name,
                image: img,
                id: item.guid || Math.random().toString()
            };
        });
    } catch (error) {
        console.error(`Error fetching from ${source.name}:`, error.message);
        return [];
    }
};

// The main loop: surveys multiple sources concurrently
const surveyInternet = async () => {
    if (state.isFetching) return;
    
    state.isFetching = true;
    state.loading = true;
    updateUI();
    
    try {
        const activeSources = feedSources[state.currentFilter];
        const promises = activeSources.map(source => fetchFeed(source));
        const results = await Promise.all(promises);
        
        let allArticles = results.flat();
        
        // Remove duplicates based on Title
        const uniqueArticles = Array.from(new Map(allArticles.map(item => [item.title, item])).values());
        
        // Sort chronologically (newest first)
        state.news = uniqueArticles.sort((a, b) => b.pubDate - a.pubDate);
        
        if (state.news.length === 0) {
            throw new Error("No payload retrieved across all node sources.");
        }

        state.error = false;
        state.lastUpdated = new Date();
    } catch (e) {
        console.error("Critical Survey Error:", e.message);
        state.error = true;
    } finally {
        state.loading = false;
        state.isFetching = false;
        state.countdown = state.updateInterval; // Reset countdown
        updateUI();
        renderNews();
    }
};

// Handles the auto-update timer
const startTimer = () => {
    if (state.timerId) clearInterval(state.timerId);
    
    state.timerId = setInterval(() => {
        if (!state.isFetching && !state.loading) {
            state.countdown--;
            elements.countdownTimer.textContent = state.countdown;
            
            if (state.lastUpdated) {
                elements.lastUpdatedTime.textContent = timeAgo(state.lastUpdated);
            }
            
            if (state.countdown <= 0) {
                surveyInternet();
            }
        }
    }, 1000);
};

// --- DOM Rendering ---

const renderNews = () => {
    elements.grid.innerHTML = '';
    
    if (state.news.length === 0 && !state.error) {
        elements.grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem; border: 1px dashed var(--card-border);">[ NO_DATA_FOUND ] Waiting for next cycle...</div>`;
        return;
    }

    state.news.forEach((article, index) => {
        // Inject Advertisement Placeholder every 5 items
        if (index > 0 && index % 5 === 0) {
            const adCard = document.createElement('div');
            adCard.className = 'news-card ad-card';
            adCard.style.animationDelay = `${(index % 10) * 0.08}s`;
            adCard.innerHTML = `
                <div class="ad-placeholder">
                    <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                    <h3>// AD_BLOCK</h3>
                    <p>AdSense Placeholder Area</p>
                </div>
            `;
            elements.grid.appendChild(adCard);
        }

        const card = document.createElement('a');
        card.href = article.link;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.className = 'news-card';
        
        card.style.animationDelay = `${(index % 10) * 0.08}s`;
        
        let desc = article.description;
        if (desc.length > 120) {
            desc = desc.substring(0, 120).trim() + '...';
        }

        card.innerHTML = `
            <div class="card-image-container">
                <img src="${article.image}" alt="" class="card-image" loading="lazy" onerror="this.src='https://picsum.photos/seed/${Math.random().toString().slice(2,8)}/500/300'">
                <span class="source-badge">${article.source}</span>
            </div>
            <div class="card-content">
                <h2 class="card-title">${article.title}</h2>
                <p class="card-description">${desc}</p>
                <div class="card-footer">
                    <span>> T_MINUS_${timeAgo(article.pubDate)}</span>
                    <div style="display:flex; gap:0.5rem">
                        <button class="discuss-btn" data-url="${article.link}" data-id="${article.id}" data-title="${article.title}">[ DISCUSS ]</button>
                        <span class="read-more">[ READ ]</span>
                    </div>
                </div>
            </div>
        `;
        
        elements.grid.appendChild(card);
    });
};

const updateUI = () => {
    if (state.loading) {
        elements.loader.classList.remove('hidden');
        elements.grid.style.display = 'none';
        elements.statusParent.classList.remove('error');
        elements.statusIndicator.textContent = 'Compiling...';
        elements.refreshBtn.disabled = true;
    } else {
        elements.loader.classList.add('hidden');
        elements.grid.style.display = 'grid';
        elements.refreshBtn.disabled = false;
        
        if (state.error) {
            elements.error.classList.remove('hidden');
            elements.statusParent.classList.add('error');
            elements.statusIndicator.textContent = 'Connection_Failed';
        } else {
            elements.error.classList.add('hidden');
            elements.statusParent.classList.remove('error');
            elements.statusIndicator.textContent = 'Terminal_Active';
            elements.lastUpdatedTime.textContent = timeAgo(state.lastUpdated);
        }
    }
    
    elements.countdownTimer.textContent = state.countdown;
};

// --- Event Listeners ---

// Disqus Logic
let disqusLoaded = false;
const loadDisqus = (url, identifier, title) => {
    elements.modalTitle.textContent = `> THREAD: ${title}`;
    
    // Set global variables for Disqus
    window.disqus_config = function () {
        this.page.url = url;  
        this.page.identifier = identifier; 
        this.page.title = title;
    };
    
    if (!disqusLoaded) {
        const d = document, s = d.createElement('script');
        // USERS MUST REPLACE 'YOUR_DISQUS_SHORTNAME'
        s.src = 'https://YOUR_DISQUS_SHORTNAME.disqus.com/embed.js';
        s.setAttribute('data-timestamp', +new Date());
        (d.head || d.body).appendChild(s);
        disqusLoaded = true;
    } else {
        if (typeof DISQUS !== 'undefined') {
            DISQUS.reset({
                reload: true,
                config: window.disqus_config
            });
        }
    }
    
    elements.modal.classList.remove('hidden');
    // small reflow delay for transition
    setTimeout(() => {
        elements.modal.classList.add('active');
    }, 10);
};

// Event Delegation for dynamically created discuss buttons
elements.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.discuss-btn');
    if (btn) {
        e.preventDefault(); // stop link navigation from parent <a> tag
        const url = btn.getAttribute('data-url');
        const id = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        loadDisqus(url, id, title);
    }
});

elements.closeModalBtn.addEventListener('click', () => {
    elements.modal.classList.remove('active');
    setTimeout(() => {
        elements.modal.classList.add('hidden');
    }, 300); // Wait for CSS transition
});

elements.refreshBtn.addEventListener('click', () => {
    if (!state.isFetching) {
        state.countdown = 0;
        surveyInternet();
    }
});

elements.filters.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn') && !state.isFetching) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        state.currentFilter = e.target.getAttribute('data-source');
        surveyInternet();
    }
});

// --- Initialization ---
const init = () => {
    surveyInternet();
    startTimer();
};

init();

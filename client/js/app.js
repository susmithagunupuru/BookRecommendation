// Smart Library Core Client Script

// Base URL for API requests (empty since they are hosted on the same server)
const API_BASE = '';

// Create Toast Container
const toastContainer = document.createElement('div');
toastContainer.className = 'fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none';
document.body.appendChild(toastContainer);

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'relative px-5 py-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md text-zinc-800 dark:text-zinc-100 rounded-2xl shadow-xl border border-outline-variant/60 flex items-center justify-between gap-3.5 pointer-events-auto transition-all duration-300 transform translate-y-4 opacity-0 max-w-sm w-80';

  let icon = 'info';
  let iconColor = 'text-primary';
  let progressColor = 'bg-primary';

  if (type === 'success') {
    icon = 'check_circle';
    iconColor = 'text-emerald-500';
    progressColor = 'bg-emerald-500';
  } else if (type === 'error') {
    icon = 'error';
    iconColor = 'text-rose-500';
    progressColor = 'bg-rose-500';
  } else if (type === 'warning') {
    icon = 'warning';
    iconColor = 'text-amber-500';
    progressColor = 'bg-amber-500';
  }

  toast.innerHTML = `
    <div class="flex items-center gap-3 flex-grow">
      <span class="material-symbols-outlined ${iconColor} text-[22px]" style="font-variation-settings: 'FILL' 1;">${icon}</span>
      <span class="text-xs font-bold leading-normal">${message}</span>
    </div>
    <button class="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors flex items-center justify-center" onclick="this.closest('.relative').remove()">
      <span class="material-symbols-outlined text-[16px]">close</span>
    </button>
    <div class="absolute bottom-0 left-0 h-1 rounded-b-2xl ${progressColor} transition-all duration-[3000ms] ease-linear" id="toast-progress" style="width: 100%;"></div>
  `;

  toastContainer.appendChild(toast);

  // Trigger animation next tick
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
    setTimeout(() => {
      const progress = toast.querySelector('#toast-progress');
      if (progress) {
        progress.style.width = '0%';
      }
    }, 50);
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3200);
}

/**
 * API Fetch wrapper handling cookies, JSON parsing and auth redirect.
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  options.credentials = 'include';
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json'
    };
  }

  try {
    const res = await fetch(url, options);
    
    if (res.status === 401 && !url.includes('/auth/status') && !url.includes('/auth/login')) {
      // Unauthorized, redirect to home page
      window.location.href = '/index.html';
      return null;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || 'API request failed');
    }
    return data;
  } catch (error) {
    console.error(`API Fetch Error [${endpoint}]:`, error);
    throw error;
  }
}

// Global User Info State
let currentUser = null;

async function checkAuthStatus() {
  try {
    const data = await apiFetch('/api/auth/status');
    if (data && data.user) {
      currentUser = data.user;
      updateHeaderNav();
    }
  } catch (e) {
    console.log('User not logged in.');
  }
}

function updateHeaderNav() {
  const headerNav = document.querySelector('header nav');
  if (!headerNav) return;

  const authSection = headerNav.querySelector('.flex.items-center.gap-stack-md');
  if (!authSection) return;

  if (currentUser) {
    const dashboardLink = currentUser.role === 'admin' ? '/admin.html' : '/dashboard.html';
    authSection.innerHTML = `
      <div class="flex items-center gap-4">
        <a href="${dashboardLink}" class="flex items-center gap-2 group">
          <img src="${currentUser.profileImage || 'https://lh3.googleusercontent.com/aida-public/avatar-default.png'}" class="w-8 h-8 rounded-full border border-primary group-hover:scale-105 transition-transform" />
          <span class="hidden md:inline font-label-md text-label-md text-on-surface group-hover:text-primary transition-colors">${currentUser.name}</span>
        </a>
        <button onclick="handleLogout()" class="px-4 py-2 border border-outline-variant rounded-xl text-on-surface hover:bg-black/5 font-label-md text-label-md active:scale-95 transition-all">Logout</button>
      </div>
    `;
    
    // Update main call-to-actions on homepage
    const enterReaderBtn = document.getElementById('enter-reader-btn');
    if (enterReaderBtn) {
      enterReaderBtn.onclick = () => window.location.href = '/dashboard.html';
    }
    const enterAdminBtn = document.getElementById('enter-admin-btn');
    if (enterAdminBtn) {
      enterAdminBtn.onclick = () => window.location.href = '/admin.html';
    }
  }
}

async function handleLogout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    showToast('Logged out successfully');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1000);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Dark Mode Initialization
function initDarkMode() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Add dark mode toggle button dynamically to Header if not present
function addDarkModeToggle() {
  const headerNav = document.querySelector('header nav');
  if (!headerNav) return;

  // Check if toggle already exists
  if (document.getElementById('dark-mode-toggle')) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'dark-mode-toggle';
  toggleBtn.className = 'p-2 rounded-xl text-on-surface-variant hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors active:scale-95';
  
  const isDark = document.documentElement.classList.contains('dark');
  toggleBtn.innerHTML = `<span class="material-symbols-outlined">${isDark ? 'light_mode' : 'dark_mode'}</span>`;
  
  toggleBtn.onclick = () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    if (isCurrentlyDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      toggleBtn.innerHTML = '<span class="material-symbols-outlined">dark_mode</span>';
      showToast('Switched to Light Mode', 'info');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      toggleBtn.innerHTML = '<span class="material-symbols-outlined">light_mode</span>';
      showToast('Switched to Dark Mode', 'info');
    }
  };

  const navLinks = headerNav.querySelector('.hidden.md\\:flex.items-center') || headerNav.querySelector('div:first-child');
  if (navLinks) {
    navLinks.appendChild(toggleBtn);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  checkAuthStatus();
  setTimeout(addDarkModeToggle, 100);
});

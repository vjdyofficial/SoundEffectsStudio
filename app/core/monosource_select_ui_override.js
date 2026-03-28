document.querySelectorAll('select').forEach(select => {
  select.addEventListener('mousedown', (e) => {
    e.preventDefault(); // stop native dropdown
    setTimeout(() => openCustomMenu(select), 0);
  });
});

function openCustomMenu(select) {
  const existing = document.querySelector('.custom-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'custom-menu';
  menu.innerHTML = Array.from(select.options)
    .map(opt => {
      const text = opt.innerHTML;
      const open = text.indexOf('(');
      const close = text.lastIndexOf(')');

      let formatted = text;

      if (open !== -1 && close !== -1 && close > open) {
        const before = text.slice(0, open).trim();

        const inside = text
          .slice(open + 1, close)
          .replace(/\)\s*\(/g, ' - ')
          .trim();

        formatted = `
      <div class="wrapper">
          <div class="title-img">${before}</div>
          ${inside
              ? `<div class="content"><small>${inside}</small></div>`
              : ''
            }
        </div>
      `;
      }

      return `
        <div class="item ${opt.disabled ? 'disabled' : ''}" data-value="${opt.value}">
          ${formatted}
        </div>
      `;
    })
    .join('');
  document.body.appendChild(menu);

  const rect = select.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.minWidth = `${rect.width}px`;
  menu.style.left = `${rect.left}px`;
  menu.style.zIndex = 2025;
  menu.style.opacity = 0;
  menu.style.transform = 'scaleY(0.95)'; // start slightly shrunken
  if (select.id !== 'categoryDropdown') {
    menu.style.maxHeight = '350px';
    menu.style.overflowY = 'auto';
  }

  // Let DOM render first
  requestAnimationFrame(() => {
    const menuHeight = menu.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let openUp = false;
    if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
      openUp = true;
      menu.style.top = `${rect.bottom - menuHeight}px`;
      menu.classList.add('flip-up');
    } else {
      menu.style.top = `${rect.top}px`;
      menu.classList.remove('flip-up');
    }

    requestAnimationFrame(() => {
      menu.classList.add('show');
      menu.style.opacity = 1;
      menu.style.transform = 'scaleY(1)';
      menu.dataset.direction = openUp ? 'up' : 'down';
    });
  });

  // Click select
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (!item) {
      return
    } else {
      select.value = item.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeMenu(menu);
    }
  });

  // Click outside
  const close = (e2) => {
    if (!menu.contains(e2.target)) closeMenu(menu);
  };
  document.addEventListener('mousedown', close);
}

// Hide animation
function closeMenu(menu) {
  menu.classList.remove('show');
  menu.style.opacity = 0;
  setTimeout(() => menu.remove(), 150);
}

// ESC closes
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const menu = document.querySelector('.custom-menu');
    if (menu) closeMenu(menu);
  }
});

// Hotkey: close custom menu when pressing any key while focus is outside the menu
document.addEventListener('keydown', (e) => {
  const menu = document.querySelector('.custom-menu');
  if (!menu) return;
  // If focus is not inside the menu, close it on any key
  if (!menu.contains(document.activeElement)) {
    closeMenu(menu);
  }
});

// Close custom menu on window resize
window.addEventListener('resize', () => {
  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);
  hideContextMenu();
});

window.addEventListener('blur', () => {
  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);
  hideContextMenu();
});

let rafCount = 0;

function monitorCustomMenu() {
  const menu = document.querySelector('.custom-menu');
  const blockArea = document.getElementById('blockArea');
  if (menu && menu.classList.contains('show')) {
    rafCount++;
    if (blockArea) blockArea.classList.add('enable');
  } else {
    rafCount = 0;
    if (blockArea) blockArea.classList.remove('enable');
  }
  requestAnimationFrame(monitorCustomMenu);
}

monitorCustomMenu();
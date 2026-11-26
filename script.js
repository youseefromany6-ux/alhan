document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1) قاعدة بيانات المتصفح (IndexedDB) لحفظ الأقسام والألحان والصور والصوت
  // =========================================================================
  const DB_NAME = 'StGeorgeHymnsLibraryDB';
  const DB_VERSION = 2;
  const STORE_NAME = 'hymns';
  const CATEGORIES_STORE = 'categories';

  function openHymnsDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
          db.createObjectStore(CATEGORIES_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadAllFromStore(storeName) {
    try {
      const db = await openHymnsDatabase();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async function saveToStore(storeName, record) {
    const db = await openHymnsDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteFromStore(storeName, recordId) {
    const db = await openHymnsDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(recordId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // 2) الأقسام والألحان الأساسية الافتراضية
  // =========================================================================
  const defaultBuiltInCategories = [
    {
      id: 'annual',
      title: 'ألحان سنوية',
      desc: 'قائمة الألحان السنوية للتسبحة والقداس ورفع البخور',
      src: 'assets/images/candle.jpg',
      isBuiltIn: true
    },
    {
      id: 'seasonal',
      title: 'ألحان موسمية',
      desc: 'ألحان الأعياد السيدية والصوم الكبير وكيهك',
      src: 'assets/images/seasonal.jpg',
      isBuiltIn: true
    },
    {
      id: 'rites',
      title: 'الطقس',
      desc: 'ترتيب الصلوات والقداسات والمردات الطقسية',
      src: 'assets/images/rites.jpg',
      isBuiltIn: true
    }
  ];

  const defaultBuiltInHymns = [
    {
      id: 'hoos-1',
      category: 'annual',
      title: 'الهوس الأول ولُبشه',
      subtitle: 'تسبحة نصف الليل — صفحات ١٩ إلى ٢٤ مع الصوت',
      isBuiltIn: true,
      audioCandidates: [
        'assets/audio/hoos1.m4a',
        'assets/audio/hoos1.m4a.m4a',
        'assets/audio/AUD-20261113-WA0000.m4a',
        'hoos1.m4a'
      ],
      pages: [
        {
          pageNumber: '١٩',
          src: 'assets/images/19.jpeg',
          startTime: 0,
          endTime: 72,
          caption: 'توتيه آفهوس إنجيه مويسيس — حينئذٍ سبّح موسى'
        },
        {
          pageNumber: '٢٠',
          src: 'assets/images/20.jpeg',
          startTime: 72,
          endTime: 137,
          caption: 'هان صوتب إن آنافاتيس — ركباناً منتخبين ذي ثلاث جنبات'
        },
        {
          pageNumber: '٢١',
          src: 'assets/images/21.jpeg',
          startTime: 137,
          endTime: 200,
          caption: 'آفجوس غار إنجيه بي جاجي — قال العدو إني أُسرع'
        },
        {
          pageNumber: '٢٢',
          src: 'assets/images/22.jpeg',
          startTime: 200,
          endTime: 261,
          caption: 'آف سوتيم إنجيه هان إثنوس — سمعت الأمم وغضبت'
        },
        {
          pageNumber: '٢٣',
          src: 'assets/images/23.jpeg',
          startTime: 261,
          endTime: 318,
          caption: 'بيك ما إثؤواب إبتشويس — موضعك المقدس يارب'
        },
        {
          pageNumber: '٢٤',
          src: 'assets/images/24.jpeg',
          startTime: 318,
          endTime: 9999,
          caption: 'جيه مارين هوس إيه إبتشويس — فلنسبح الرب لأنه بالمجد قد تمجد'
        }
      ]
    }
  ];

  let allCategories = [];
  let allHymns = [];
  let activeCategory = 'annual';
  let activeHymn = null;
  let activePages = [];
  let currentPageIndex = 0;
  let flipTimer = null;
  let activeObjectUrls = [];
  let categoryObjectUrls = [];
  let isLiveSyncActive = false;

  // =========================================================================
  // 3) عناصر الواجهة
  // =========================================================================
  const views = {
    home: document.getElementById('view-home'),
    categories: document.getElementById('view-categories'),
    hymnsList: document.getElementById('view-hymns-list'),
    player: document.getElementById('view-player')
  };

  const btnEnter = document.getElementById('btn-enter');
  const btnBackHome = document.getElementById('btn-back-home');
  const btnBackToCategories = document.getElementById('btn-back-to-categories');
  const btnBackHymns = document.getElementById('btn-back-hymns');

  // عناصر صفحة الأقسام
  const categoriesGrid = document.getElementById('categories-grid');
  const btnOpenAddCategory = document.getElementById('btn-open-add-category');

  // عناصر نافذة إضافة/تعديل قسم
  const categoryModal = document.getElementById('category-editor-modal');
  const categoryModalBackdrop = document.getElementById('category-modal-backdrop');
  const categoryModalTitle = document.getElementById('category-modal-title');
  const btnCloseCategoryModal = document.getElementById('btn-close-category-modal');
  const categoryEditorForm = document.getElementById('category-editor-form');
  const inputCategoryTitle = document.getElementById('input-category-title');
  const inputCategoryDesc = document.getElementById('input-category-desc');
  const inputCategoryImage = document.getElementById('input-category-image');
  const currentCategoryImgHint = document.getElementById('current-category-img-hint');
  const categoryModalError = document.getElementById('category-modal-error');
  const btnDeleteCategory = document.getElementById('btn-delete-category');
  let editingCategoryId = null;

  // عناصر قائمة الألحان
  const hymnsListHeading = document.getElementById('hymns-list-heading');
  const hymnsListGrid = document.getElementById('hymns-list-grid');
  const hymnSearchInput = document.getElementById('hymn-search-input');
  const hymnListNotice = document.getElementById('hymn-list-notice');

  const btnOpenAddHymnTop = document.getElementById('btn-open-add-hymn');
  const btnOpenAddHymnMain = document.getElementById('btn-open-add-hymn-main');
  const btnEditCurrentHymn = document.getElementById('btn-edit-current-hymn');

  // عناصر المزامنة المباشرة
  const btnStartLiveSync = document.getElementById('btn-start-live-sync');
  const liveSyncPanel = document.getElementById('live-sync-panel');
  const syncPanelStatus = document.getElementById('sync-panel-status');
  const btnSyncNextPage = document.getElementById('btn-sync-next-page');
  const btnCancelLiveSync = document.getElementById('btn-cancel-live-sync');
  const syncSavedToast = document.getElementById('sync-saved-toast');

  // عناصر المشغل والعارض
  const lessonHeading = document.getElementById('lesson-heading');
  const pageCounter = document.getElementById('page-counter');
  const readerThumbs = document.getElementById('reader-thumbs');
  const manuscriptImg = document.getElementById('manuscript-image');
  const readerViewport = document.getElementById('reader-viewport');
  const verseCaption = document.getElementById('verse-caption');

  const audio = document.getElementById('hymn-audio');
  const audioStatusMsg = document.getElementById('audio-status-msg');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnReplayPage = document.getElementById('btn-replay-page');
  const scrubber = document.getElementById('audio-scrubber');
  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');

  // عناصر تكبير الصورة
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');
  const zoomLevelLabel = document.getElementById('zoom-level-label');

  // عناصر نافذة إضافة وتعديل الألحان
  const editorModal = document.getElementById('hymn-editor-modal');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalEditorTitle = document.getElementById('modal-editor-title');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const editorForm = document.getElementById('hymn-editor-form');
  const inputHymnCategory = document.getElementById('input-hymn-category');
  const inputHymnTitle = document.getElementById('input-hymn-title');
  const inputHymnSubtitle = document.getElementById('input-hymn-subtitle');
  const inputHymnAudio = document.getElementById('input-hymn-audio');
  const currentAudioHint = document.getElementById('current-audio-hint');
  const inputBulkImages = document.getElementById('input-bulk-images');
  const btnAddSinglePage = document.getElementById('btn-add-single-page');
  const pagesBuilderList = document.getElementById('pages-builder-list');
  const modalErrorMsg = document.getElementById('modal-error-msg');
  const btnDeleteHymn = document.getElementById('btn-delete-hymn');

  let editingHymnId = null;
  let draftPages = [];

  // =========================================================================
  // 4) إدارة الأقسام وعرضها (تعديل صورة واسم أي قسم + إضافة أقسام جديدة)
  // =========================================================================
  function getCategoryTitle(catId) {
    const found = allCategories.find((c) => c.id === catId);
    return found ? found.title : 'الألحان';
  }

  function populateCategorySelect() {
    inputHymnCategory.innerHTML = '';
    allCategories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.title;
      inputHymnCategory.appendChild(option);
    });
  }

  async function refreshCategoriesLibrary() {
    const savedCategories = await loadAllFromStore(CATEGORIES_STORE);
    const savedMap = new Map(savedCategories.map((item) => [item.id, item]));

    const merged = defaultBuiltInCategories.map((builtIn) =>
      savedMap.has(builtIn.id) ? savedMap.get(builtIn.id) : builtIn
    );

    savedCategories.forEach((item) => {
      if (!defaultBuiltInCategories.some((b) => b.id === item.id)) {
        merged.push(item);
      }
    });

    allCategories = merged;
    populateCategorySelect();
  }

  function renderCategoriesGrid() {
    categoryObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    categoryObjectUrls = [];
    categoriesGrid.innerHTML = '';

    allCategories.forEach((cat) => {
      const card = document.createElement('article');
      card.className = 'category-card';
      card.setAttribute('role', 'listitem');

      let resolvedImgSrc = cat.src || '';
      if (cat.imageBlob instanceof Blob) {
        resolvedImgSrc = URL.createObjectURL(cat.imageBlob);
        categoryObjectUrls.push(resolvedImgSrc);
      }

      const mediaHtml = resolvedImgSrc
        ? `<img src="${resolvedImgSrc}" alt="${cat.title}" class="category-card__img">`
        : `<div class="img--fallback">${cat.title}</div>`;

      card.innerHTML = `
        <button type="button" class="category-card__trigger">
          <div class="category-card__media">
            ${mediaHtml}
          </div>
          <div class="category-card__body">
            <h3 class="category-card__title">${cat.title}</h3>
            <p class="category-card__desc">${cat.desc || 'ألحان وصفحات هذا القسم'}</p>
          </div>
        </button>
        <button type="button" class="category-card__edit-btn" aria-label="تعديل وتغيير صورة قسم ${cat.title}">
          تعديل القسم / تغيير الصورة
        </button>
      `;

      const imgEl = card.querySelector('.category-card__img');
      if (imgEl) {
        imgEl.addEventListener('error', () => {
          const placeholder = document.createElement('div');
          placeholder.className = 'img--fallback';
          placeholder.textContent = cat.title;
          imgEl.replaceWith(placeholder);
        });
      }

      card.querySelector('.category-card__trigger').addEventListener('click', () => {
        activeCategory = cat.id;
        hymnsListHeading.textContent = cat.title;
        hymnSearchInput.value = '';
        renderHymnsList();
        showView('hymnsList');
      });

      card.querySelector('.category-card__edit-btn').addEventListener('click', () => {
        openCategoryModal(cat);
      });

      categoriesGrid.appendChild(card);
    });
  }

  function openCategoryModal(categoryToEdit = null) {
    categoryModalError.hidden = true;
    inputCategoryImage.value = '';

    if (categoryToEdit) {
      editingCategoryId = categoryToEdit.id;
      categoryModalTitle.textContent = `تعديل القسم: ${categoryToEdit.title}`;
      inputCategoryTitle.value = categoryToEdit.title;
      inputCategoryDesc.value = categoryToEdit.desc || '';

      if (categoryToEdit.imageBlob instanceof Blob) {
        currentCategoryImgHint.textContent = 'توجد صورة مرفوعة لهذا القسم (اختر صورة جديدة لاستبدالها أو اترك الخانة فارغة).';
        currentCategoryImgHint.hidden = false;
      } else {
        currentCategoryImgHint.textContent = 'اختر صورة من جهازك لتظهر على أيقونة هذا القسم.';
        currentCategoryImgHint.hidden = false;
      }

      btnDeleteCategory.hidden = Boolean(categoryToEdit.isBuiltIn);
    } else {
      editingCategoryId = null;
      categoryModalTitle.textContent = 'إضافة قسم جديد';
      inputCategoryTitle.value = '';
      inputCategoryDesc.value = '';
      currentCategoryImgHint.hidden = true;
      btnDeleteCategory.hidden = true;
    }

    categoryModal.hidden = false;
  }

  function closeCategoryModal() {
    categoryModal.hidden = true;
  }

  btnOpenAddCategory.addEventListener('click', () => openCategoryModal(null));
  btnCloseCategoryModal.addEventListener('click', closeCategoryModal);
  categoryModalBackdrop.addEventListener('click', closeCategoryModal);

  categoryEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = inputCategoryTitle.value.trim();
    if (!title) {
      categoryModalError.textContent = 'من فضلك اكتب اسم القسم أولاً.';
      categoryModalError.hidden = false;
      return;
    }

    const existingCat = editingCategoryId
      ? allCategories.find((c) => c.id === editingCategoryId)
      : null;

    const newImgFile = inputCategoryImage.files[0] || null;

    const categoryRecord = {
      id: editingCategoryId || `custom-cat-${Date.now()}`,
      title,
      desc: inputCategoryDesc.value.trim() || `ألحان وصفحات ${title}`,
      src: existingCat ? existingCat.src || '' : '',
      imageBlob: newImgFile || (existingCat ? existingCat.imageBlob || null : null),
      isBuiltIn: existingCat ? Boolean(existingCat.isBuiltIn) : false
    };

    try {
      await saveToStore(CATEGORIES_STORE, categoryRecord);
      await refreshCategoriesLibrary();
    } catch {
      const idx = allCategories.findIndex((c) => c.id === categoryRecord.id);
      if (idx !== -1) {
        allCategories[idx] = categoryRecord;
      } else {
        allCategories.push(categoryRecord);
      }
      populateCategorySelect();
    }

    renderCategoriesGrid();
    closeCategoryModal();
  });

  btnDeleteCategory.addEventListener('click', async () => {
    if (!editingCategoryId) return;
    await deleteFromStore(CATEGORIES_STORE, editingCategoryId);
    await refreshCategoriesLibrary();
    renderCategoriesGrid();
    closeCategoryModal();
  });

  // =========================================================================
  // 5) تكبير وتصغير الصورة نفسها فقط
  // =========================================================================
  const zoomLevels = [100, 130, 160, 200, 240];
  let currentZoomIndex = 0;

  function applyZoomLevel(newIndex) {
    if (newIndex < 0 || newIndex >= zoomLevels.length) return;
    currentZoomIndex = newIndex;
    const zoomValue = zoomLevels[currentZoomIndex];

    zoomLevels.forEach((lvl) => {
      manuscriptImg.classList.remove(`reader__page-img--zoom-${lvl}`);
    });
    manuscriptImg.classList.add(`reader__page-img--zoom-${zoomValue}`);

    zoomLevelLabel.textContent = `${zoomValue}%`;
    btnZoomOut.disabled = currentZoomIndex === 0;
    btnZoomIn.disabled = currentZoomIndex === zoomLevels.length - 1;
  }

  btnZoomIn.addEventListener('click', () => applyZoomLevel(currentZoomIndex + 1));
  btnZoomOut.addEventListener('click', () => applyZoomLevel(currentZoomIndex - 1));
  btnZoomReset.addEventListener('click', () => {
    applyZoomLevel(0);
    readerViewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  });

  manuscriptImg.addEventListener('dblclick', () => {
    applyZoomLevel(currentZoomIndex === 0 ? 2 : 0);
  });

  // =========================================================================
  // 6) دمج الألحان المحفوظة والافتراضية وعرض القائمة
  // =========================================================================
  async function refreshHymnsLibrary() {
    const savedHymns = await loadAllFromStore(STORE_NAME);
    const savedMap = new Map(savedHymns.map((item) => [item.id, item]));

    const merged = defaultBuiltInHymns.map((builtIn) =>
      savedMap.has(builtIn.id) ? savedMap.get(builtIn.id) : builtIn
    );

    savedHymns.forEach((item) => {
      if (!defaultBuiltInHymns.some((b) => b.id === item.id)) {
        merged.push(item);
      }
    });

    allHymns = merged;
  }

  function renderHymnsList(filterQuery = '') {
    const cleanQuery = filterQuery.trim();
    const categoryHymns = allHymns.filter(
      (h) => (h.category || 'annual') === activeCategory
    );

    const filtered = categoryHymns.filter(
      (h) =>
        h.title.includes(cleanQuery) ||
        (h.subtitle && h.subtitle.includes(cleanQuery))
    );

    hymnsListGrid.innerHTML = '';

    if (filtered.length === 0) {
      hymnListNotice.textContent = 'لا توجد ألحان مضافة في هذا القسم بعد — اضغط على «+ إضافة لحن جديد» لإضافة أول لحن وصوره.';
      hymnListNotice.hidden = false;
      return;
    }

    hymnListNotice.hidden = true;

    filtered.forEach((hymn, index) => {
      const card = document.createElement('article');
      card.className = 'hymn-item';
      card.setAttribute('role', 'listitem');

      const pagesCount = hymn.pages ? hymn.pages.length : 0;
      const badgeText = pagesCount > 0 ? `${pagesCount} صفحات` : 'بدون صفحات';

      card.innerHTML = `
        <button type="button" class="hymn-item__trigger">
          <div class="hymn-item__info">
            <span class="hymn-item__number">${index + 1}</span>
            <div>
              <h3 class="hymn-item__title">${hymn.title}</h3>
              <p class="hymn-item__subtitle">${hymn.subtitle || 'اضغط لفتح الصفحات والصوت'}</p>
            </div>
          </div>
          <span class="hymn-item__status hymn-item__status--ready">${badgeText}</span>
        </button>
        <button type="button" class="hymn-item__edit-btn" aria-label="تعديل ${hymn.title}">
          تعديل
        </button>
      `;

      card.querySelector('.hymn-item__trigger').addEventListener('click', () => {
        openHymnInPlayer(hymn);
      });

      card.querySelector('.hymn-item__edit-btn').addEventListener('click', () => {
        openEditorModal(hymn);
      });

      hymnsListGrid.appendChild(card);
    });
  }

  // =========================================================================
  // 7) فتح اللحن في المشغل وربط الصوت بالصفحات
  // =========================================================================
  function clearActiveObjectUrls() {
    activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeObjectUrls = [];
  }

  let activeAudioCandidates = [];
  let candidatePointer = 0;

  audio.addEventListener('error', () => {
    candidatePointer += 1;
    if (candidatePointer < activeAudioCandidates.length) {
      audio.src = activeAudioCandidates[candidatePointer];
      audio.load();
    } else if (activeAudioCandidates.length > 0) {
      audioStatusMsg.textContent = 'تنبيه: ملف الصوت غير متوفر حالياً، يمكنك رفعه من زرار «+ إضافة صفحات / تعديل اللحن» بالأعلى.';
      audioStatusMsg.hidden = false;
    }
  });

  audio.addEventListener('canplay', () => {
    audioStatusMsg.hidden = true;
  });

  function openHymnInPlayer(hymn) {
    stopLiveSyncMode();
    syncSavedToast.hidden = true;
    clearActiveObjectUrls();
    activeHymn = hymn;
    lessonHeading.textContent = hymn.title;
    audioStatusMsg.hidden = true;

    activePages = (hymn.pages || []).map((p, idx) => {
      let resolvedSrc = p.src || '';
      if (p.imageBlob instanceof Blob) {
        resolvedSrc = URL.createObjectURL(p.imageBlob);
        activeObjectUrls.push(resolvedSrc);
      }
      return {
        pageNumber: p.pageNumber || String(idx + 1),
        src: resolvedSrc,
        rawSrc: p.src || '',
        imageBlob: p.imageBlob || null,
        startTime: Number(p.startTime) || 0,
        endTime: Number(p.endTime) || 9999,
        caption: p.caption || `${hymn.title} — صفحة ${p.pageNumber || idx + 1}`
      };
    });

    readerThumbs.innerHTML = '';
    activePages.forEach((page, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'reader__thumb' + (idx === 0 ? ' reader__thumb--active' : '');
      btn.textContent = `صفحة ${page.pageNumber}`;
      btn.addEventListener('click', () => {
        if (isLiveSyncActive) return;
        setActivePage(idx, true);
        jumpToTimeAndPlay(page.startTime);
      });
      readerThumbs.appendChild(btn);
    });

    audio.pause();
    updatePlayButtonLabel();
    scrubber.value = 0;
    timeCurrent.textContent = '00:00';

    if (hymn.audioBlob instanceof Blob) {
      const audioUrl = URL.createObjectURL(hymn.audioBlob);
      activeObjectUrls.push(audioUrl);
      activeAudioCandidates = [audioUrl];
      candidatePointer = 0;
      audio.src = audioUrl;
      audio.load();
    } else if (hymn.audioCandidates && hymn.audioCandidates.length > 0) {
      activeAudioCandidates = [...hymn.audioCandidates];
      candidatePointer = 0;
      audio.src = activeAudioCandidates[0];
      audio.load();
    } else {
      activeAudioCandidates = [];
      audio.removeAttribute('src');
      audioStatusMsg.textContent = 'لم يتم إرفاق ملف صوت لهذا اللحن بعد — اضغط «+ إضافة صفحات / تعديل اللحن» لإرفاق الصوت.';
      audioStatusMsg.hidden = false;
    }

    currentPageIndex = -1;
    if (activePages.length > 0) {
      setActivePage(0, false);
    } else {
      manuscriptImg.removeAttribute('src');
      verseCaption.textContent = 'لا توجد صفحات مضافة لهذا اللحن بعد.';
      pageCounter.textContent = '0 صفحات';
    }

    applyZoomLevel(0);
    showView('player');
  }

  // =========================================================================
  // 8) وضع المزامنة المباشرة بضغطة واحدة أثناء الاستماع
  // =========================================================================
  function updateLiveSyncButtonLabel() {
    if (!isLiveSyncActive) return;
    const nextIdx = currentPageIndex + 1;
    const nowFormatted = formatTime(audio.currentTime);

    if (nextIdx < activePages.length - 1) {
      const nextNum = activePages[nextIdx].pageNumber;
      btnSyncNextPage.textContent = `انتهت الصفحة — انتقل لصفحة ${nextNum} (${nowFormatted})`;
    } else if (nextIdx === activePages.length - 1) {
      const lastNum = activePages[nextIdx].pageNumber;
      btnSyncNextPage.textContent = `انتهت الصفحة — انتقل للأخيرة (${lastNum}) واحفظ (${nowFormatted})`;
    }
  }

  function startLiveSyncMode() {
    if (!activeHymn || activePages.length < 2) {
      syncSavedToast.textContent = 'يجب أن يحتوي اللحن على صفحتين على الأقل لضبط المزامنة.';
      syncSavedToast.hidden = false;
      return;
    }

    if (!audio.src) {
      audioStatusMsg.textContent = 'ارفع ملف الصوت أولاً من «+ إضافة صفحات / تعديل اللحن» ثم ابدأ المزامنة.';
      audioStatusMsg.hidden = false;
      return;
    }

    syncSavedToast.hidden = true;
    isLiveSyncActive = true;

    activePages.forEach((p, idx) => {
      p.startTime = idx === 0 ? 0 : 9999;
      p.endTime = 9999;
    });

    setActivePage(0, false);
    liveSyncPanel.hidden = false;
    syncPanelStatus.textContent = `أنت الآن في صفحة ${activePages[0].pageNumber} — اسمع الصوت، وأول ما آخر كلمة في الصفحة تخلص اضغط الزرار:`;
    updateLiveSyncButtonLabel();
    jumpToTimeAndPlay(0);
  }

  function stopLiveSyncMode() {
    isLiveSyncActive = false;
    liveSyncPanel.hidden = true;
  }

  async function saveSyncedTimingsToDB() {
    if (!activeHymn) return;

    const updatedRecord = {
      ...activeHymn,
      pages: activePages.map((p) => ({
        pageNumber: p.pageNumber,
        src: p.rawSrc || '',
        imageBlob: p.imageBlob || null,
        startTime: p.startTime,
        endTime: p.endTime,
        caption: p.caption
      }))
    };

    try {
      await saveToStore(STORE_NAME, updatedRecord);
      activeHymn = updatedRecord;
      await refreshHymnsLibrary();
      syncSavedToast.textContent = 'تم حفظ مزامنة الصوت مع جميع الصفحات بنجاح! ستتقلب الصفحات تلقائياً في كل مرة.';
      syncSavedToast.hidden = false;
    } catch {
      syncSavedToast.textContent = 'تم تطبيق المزامنة في الجلسة الحالية.';
      syncSavedToast.hidden = false;
    }
  }

  btnStartLiveSync.addEventListener('click', startLiveSyncMode);
  btnCancelLiveSync.addEventListener('click', stopLiveSyncMode);

  btnSyncNextPage.addEventListener('click', async () => {
    if (!isLiveSyncActive) return;

    const capturedSecond = Math.max(1, Math.round(audio.currentTime));
    const nextIdx = currentPageIndex + 1;

    if (nextIdx >= activePages.length) {
      stopLiveSyncMode();
      await saveSyncedTimingsToDB();
      return;
    }

    activePages[currentPageIndex].endTime = capturedSecond;
    activePages[nextIdx].startTime = capturedSecond;
    activePages[nextIdx].endTime = 9999;

    setActivePage(nextIdx, true);

    if (nextIdx === activePages.length - 1) {
      stopLiveSyncMode();
      await saveSyncedTimingsToDB();
    } else {
      syncPanelStatus.textContent = `أنت الآن في صفحة ${activePages[nextIdx].pageNumber} — اضغط الزرار عند انتهاء آخر كلمة فيها:`;
      updateLiveSyncButtonLabel();
    }
  });

  // =========================================================================
  // 9) التنقل والتحكم في الصوت
  // =========================================================================
  function showView(targetKey) {
    Object.entries(views).forEach(([key, section]) => {
      const isTarget = key === targetKey;
      section.hidden = !isTarget;
      section.classList.toggle('view--active', isTarget);
    });

    if (targetKey !== 'player') {
      stopLiveSyncMode();
      if (!audio.paused) {
        audio.pause();
        updatePlayButtonLabel();
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function setActivePage(index, shouldAnimate = true) {
    if (index < 0 || index >= activePages.length) return;
    if (index === currentPageIndex) return;

    currentPageIndex = index;
    const pageData = activePages[index];

    if (flipTimer) {
      window.clearTimeout(flipTimer);
    }

    if (shouldAnimate) {
      manuscriptImg.classList.add('reader__page-img--flipping');
      flipTimer = window.setTimeout(() => {
        manuscriptImg.src = pageData.src;
        manuscriptImg.alt = `صفحة ${pageData.pageNumber}`;
        manuscriptImg.classList.remove('reader__page-img--flipping');
      }, 150);
    } else {
      manuscriptImg.src = pageData.src;
      manuscriptImg.alt = `صفحة ${pageData.pageNumber}`;
    }

    verseCaption.textContent = pageData.caption;
    pageCounter.textContent = `صفحة ${pageData.pageNumber}`;

    const allThumbBtns = readerThumbs.querySelectorAll('.reader__thumb');
    allThumbBtns.forEach((btn, idx) => {
      btn.classList.toggle('reader__thumb--active', idx === index);
    });
  }

  function updatePlayButtonLabel() {
    btnPlayPause.textContent = audio.paused ? 'تشغيل الصوت' : 'إيقاف مؤقت';
  }

  function playAudioSafely() {
    if (!audio.src) return;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          audioStatusMsg.hidden = true;
          updatePlayButtonLabel();
        })
        .catch(() => {
          audioStatusMsg.textContent = 'تعذّر تشغيل الصوت — تأكد من اختيار ملف صوت صالح.';
          audioStatusMsg.hidden = false;
        });
    } else {
      updatePlayButtonLabel();
    }
  }

  function jumpToTimeAndPlay(targetSeconds) {
    if (!audio.src) return;
    const applySeek = () => {
      audio.currentTime = targetSeconds;
      scrubber.value = targetSeconds;
      timeCurrent.textContent = formatTime(targetSeconds);
      playAudioSafely();
    };

    if (audio.readyState >= 1) {
      applySeek();
    } else {
      audio.addEventListener('loadedmetadata', applySeek, { once: true });
      audio.load();
    }
  }

  function syncPageWithAudio() {
    const now = audio.currentTime;
    scrubber.value = now;
    timeCurrent.textContent = formatTime(now);

    if (isLiveSyncActive) {
      updateLiveSyncButtonLabel();
      return;
    }

    const matchedIndex = activePages.findIndex(
      (page) => now >= page.startTime && now < page.endTime
    );

    if (matchedIndex !== -1 && matchedIndex !== currentPageIndex) {
      setActivePage(matchedIndex, true);
    }
  }

  btnEnter.addEventListener('click', () => showView('categories'));
  btnBackHome.addEventListener('click', () => showView('home'));
  btnBackToCategories.addEventListener('click', () => showView('categories'));
  btnBackHymns.addEventListener('click', () => {
    renderHymnsList(hymnSearchInput.value);
    showView('hymnsList');
  });

  hymnSearchInput.addEventListener('input', (e) => {
    renderHymnsList(e.target.value);
  });

  btnPlayPause.addEventListener('click', () => {
    if (audio.paused) {
      playAudioSafely();
    } else {
      audio.pause();
      updatePlayButtonLabel();
    }
  });

  btnReplayPage.addEventListener('click', () => {
    if (activePages[currentPageIndex]) {
      jumpToTimeAndPlay(activePages[currentPageIndex].startTime);
    }
  });

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration)) {
      scrubber.max = Math.ceil(audio.duration);
      timeDuration.textContent = formatTime(audio.duration);
    }
  });

  audio.addEventListener('timeupdate', syncPageWithAudio);
  audio.addEventListener('play', updatePlayButtonLabel);
  audio.addEventListener('pause', updatePlayButtonLabel);
  audio.addEventListener('ended', updatePlayButtonLabel);

  window.setInterval(() => {
    if (!audio.paused) {
      syncPageWithAudio();
    }
  }, 150);

  scrubber.addEventListener('input', () => {
    const newTime = Number(scrubber.value);
    audio.currentTime = newTime;
    syncPageWithAudio();
  });

  // =========================================================================
  // 10) نافذة إضافة لحن جديد أو إضافة صفحات من داخل الموقع (Modal Builder)
  // =========================================================================
  function secondsToMinSec(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds >= 9999 || totalSeconds < 0) {
      return { min: '', sec: '' };
    }
    return {
      min: Math.floor(totalSeconds / 60),
      sec: Math.floor(totalSeconds % 60)
    };
  }

  function renderDraftPagesList() {
    pagesBuilderList.innerHTML = '';

    draftPages.forEach((page, idx) => {
      const row = document.createElement('div');
      row.className = 'page-row';

      let previewUrl = page.src || '';
      if (page.imageBlob instanceof Blob) {
        previewUrl = URL.createObjectURL(page.imageBlob);
      }

      row.innerHTML = `
        <div class="page-row__top">
          <img src="${previewUrl}" alt="معاينة الصفحة" class="page-row__preview">
          <div class="page-row__meta">
            <input
              type="text"
              class="form-control js-page-num"
              value="${page.pageNumber}"
              placeholder="رقم أو اسم الصفحة (مثال: ١)"
              aria-label="رقم الصفحة"
            >
            <input
              type="file"
              class="form-control js-page-file"
              accept="image/*"
              aria-label="اختر صورة الصفحة"
            >
          </div>
          <button type="button" class="page-row__remove js-remove-page">حذف</button>
        </div>

        <div class="page-row__timings">
          <div class="time-box">
            <span>تبدأ عند:</span>
            <input type="number" min="0" max="120" class="time-box__input js-start-min" value="${page.startMin}" placeholder="دقيقة" aria-label="دقيقة البداية">
            <span>:</span>
            <input type="number" min="0" max="59" class="time-box__input js-start-sec" value="${page.startSec}" placeholder="ثانية" aria-label="ثانية البداية">
          </div>

          <div class="time-box">
            <span>تنتهي عند:</span>
            <input type="number" min="0" max="120" class="time-box__input js-end-min" value="${page.endMin}" placeholder="دقيقة" aria-label="دقيقة النهاية">
            <span>:</span>
            <input type="number" min="0" max="59" class="time-box__input js-end-sec" value="${page.endSec}" placeholder="ثانية" aria-label="ثانية النهاية">
          </div>
        </div>
      `;

      row.querySelector('.js-page-num').addEventListener('input', (e) => {
        draftPages[idx].pageNumber = e.target.value;
      });

      row.querySelector('.js-page-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          draftPages[idx].imageBlob = file;
          row.querySelector('.page-row__preview').src = URL.createObjectURL(file);
        }
      });

      const syncTimings = () => {
        draftPages[idx].startMin = row.querySelector('.js-start-min').value;
        draftPages[idx].startSec = row.querySelector('.js-start-sec').value;
        draftPages[idx].endMin = row.querySelector('.js-end-min').value;
        draftPages[idx].endSec = row.querySelector('.js-end-sec').value;

        if (draftPages[idx + 1]) {
          draftPages[idx + 1].startMin = draftPages[idx].endMin;
          draftPages[idx + 1].startSec = draftPages[idx].endSec;
          const nextRow = pagesBuilderList.children[idx + 1];
          if (nextRow) {
            nextRow.querySelector('.js-start-min').value = draftPages[idx].endMin;
            nextRow.querySelector('.js-start-sec').value = draftPages[idx].endSec;
          }
        }
      };

      row.querySelector('.js-start-min').addEventListener('input', syncTimings);
      row.querySelector('.js-start-sec').addEventListener('input', syncTimings);
      row.querySelector('.js-end-min').addEventListener('input', syncTimings);
      row.querySelector('.js-end-sec').addEventListener('input', syncTimings);

      row.querySelector('.js-remove-page').addEventListener('click', () => {
        draftPages.splice(idx, 1);
        renderDraftPagesList();
      });

      pagesBuilderList.appendChild(row);
    });
  }

  function openEditorModal(hymnToEdit = null) {
    modalErrorMsg.hidden = true;
    inputHymnAudio.value = '';
    inputBulkImages.value = '';
    populateCategorySelect();

    if (hymnToEdit) {
      editingHymnId = hymnToEdit.id;
      modalEditorTitle.textContent = `تعديل وإضافة صفحات: ${hymnToEdit.title}`;
      inputHymnCategory.value = hymnToEdit.category || activeCategory;
      inputHymnTitle.value = hymnToEdit.title;
      inputHymnSubtitle.value = hymnToEdit.subtitle || '';

      if (hymnToEdit.audioBlob || (hymnToEdit.audioCandidates && hymnToEdit.audioCandidates.length)) {
        currentAudioHint.textContent = 'يوجد ملف صوت محفوظ لهذا اللحن (اترك الخانة فارغة للإبقاء عليه أو اختر ملفاً جديداً).';
        currentAudioHint.hidden = false;
      } else {
        currentAudioHint.hidden = true;
      }

      draftPages = (hymnToEdit.pages || []).map((p) => {
        const startObj = secondsToMinSec(p.startTime);
        const endObj = secondsToMinSec(p.endTime);
        return {
          pageNumber: p.pageNumber,
          src: p.src || '',
          imageBlob: p.imageBlob || null,
          caption: p.caption || '',
          startMin: startObj.min === '' ? 0 : startObj.min,
          startSec: startObj.sec === '' ? 0 : startObj.sec,
          endMin: endObj.min,
          endSec: endObj.sec
        };
      });

      btnDeleteHymn.hidden = Boolean(hymnToEdit.isBuiltIn);
    } else {
      editingHymnId = null;
      modalEditorTitle.textContent = 'إضافة لحن جديد';
      inputHymnCategory.value = activeCategory;
      inputHymnTitle.value = '';
      inputHymnSubtitle.value = '';
      currentAudioHint.hidden = true;
      btnDeleteHymn.hidden = true;

      draftPages = [
        {
          pageNumber: '١',
          src: '',
          imageBlob: null,
          caption: '',
          startMin: 0,
          startSec: 0,
          endMin: '',
          endSec: ''
        }
      ];
    }

    renderDraftPagesList();
    editorModal.hidden = false;
  }

  function closeEditorModal() {
    editorModal.hidden = true;
  }

  btnOpenAddHymnTop.addEventListener('click', () => openEditorModal(null));
  btnOpenAddHymnMain.addEventListener('click', () => openEditorModal(null));
  btnEditCurrentHymn.addEventListener('click', () => {
    if (activeHymn) openEditorModal(activeHymn);
  });
  btnCloseModal.addEventListener('click', closeEditorModal);
  modalBackdrop.addEventListener('click', closeEditorModal);

  inputBulkImages.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (draftPages.length === 1 && !draftPages[0].imageBlob && !draftPages[0].src) {
      draftPages = [];
    }

    files.forEach((file) => {
      const prevPage = draftPages[draftPages.length - 1];
      const nextStartMin = prevPage ? prevPage.endMin : 0;
      const nextStartSec = prevPage ? prevPage.endSec : 0;

      draftPages.push({
        pageNumber: String(draftPages.length + 1),
        src: '',
        imageBlob: file,
        caption: '',
        startMin: nextStartMin === '' ? 0 : nextStartMin,
        startSec: nextStartSec === '' ? 0 : nextStartSec,
        endMin: '',
        endSec: ''
      });
    });

    renderDraftPagesList();
    inputBulkImages.value = '';
  });

  btnAddSinglePage.addEventListener('click', () => {
    const prevPage = draftPages[draftPages.length - 1];
    const nextStartMin = prevPage ? prevPage.endMin : 0;
    const nextStartSec = prevPage ? prevPage.endSec : 0;

    draftPages.push({
      pageNumber: String(draftPages.length + 1),
      src: '',
      imageBlob: null,
      caption: '',
      startMin: nextStartMin === '' ? 0 : nextStartMin,
      startSec: nextStartSec === '' ? 0 : nextStartSec,
      endMin: '',
      endSec: ''
    });

    renderDraftPagesList();
  });

  editorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = inputHymnTitle.value.trim();
    if (!title) {
      modalErrorMsg.textContent = 'من فضلك اكتب اسم اللحن أولاً.';
      modalErrorMsg.hidden = false;
      return;
    }

    const validPages = draftPages.filter((p) => p.imageBlob || p.src);
    if (validPages.length === 0) {
      modalErrorMsg.textContent = 'من فضلك اختر صورة واحدة على الأقل لصفحات اللحن.';
      modalErrorMsg.hidden = false;
      return;
    }

    const existingHymn = editingHymnId
      ? allHymns.find((h) => h.id === editingHymnId)
      : null;

    const formattedPages = validPages.map((p, idx) => {
      const startSeconds = (Number(p.startMin) || 0) * 60 + (Number(p.startSec) || 0);
      const hasEnd = p.endMin !== '' || p.endSec !== '';
      const rawEnd = (Number(p.endMin) || 0) * 60 + (Number(p.endSec) || 0);
      const endSeconds = hasEnd && rawEnd > startSeconds ? rawEnd : 9999;

      return {
        pageNumber: p.pageNumber.trim() || String(idx + 1),
        src: p.src || '',
        imageBlob: p.imageBlob || null,
        startTime: startSeconds,
        endTime: endSeconds,
        caption: p.caption || `${title} — صفحة ${p.pageNumber.trim() || idx + 1}`
      };
    });

    const newAudioFile = inputHymnAudio.files[0] || null;

    const hymnRecord = {
      id: editingHymnId || `custom-hymn-${Date.now()}`,
      category: inputHymnCategory.value,
      title,
      subtitle: inputHymnSubtitle.value.trim() || `${formattedPages.length} صفحات`,
      isBuiltIn: existingHymn ? Boolean(existingHymn.isBuiltIn) : false,
      audioCandidates: existingHymn ? existingHymn.audioCandidates || [] : [],
      audioBlob: newAudioFile || (existingHymn ? existingHymn.audioBlob || null : null),
      pages: formattedPages
    };

    try {
      await saveToStore(STORE_NAME, hymnRecord);
      await refreshHymnsLibrary();
    } catch {
      const idx = allHymns.findIndex((h) => h.id === hymnRecord.id);
      if (idx !== -1) {
        allHymns[idx] = hymnRecord;
      } else {
        allHymns.push(hymnRecord);
      }
    }

    activeCategory = hymnRecord.category;
    hymnsListHeading.textContent = getCategoryTitle(activeCategory);
    renderHymnsList(hymnSearchInput.value);
    closeEditorModal();
    openHymnInPlayer(hymnRecord);
  });

  btnDeleteHymn.addEventListener('click', async () => {
    if (!editingHymnId) return;
    await deleteFromStore(STORE_NAME, editingHymnId);
    await refreshHymnsLibrary();
    renderHymnsList(hymnSearchInput.value);
    closeEditorModal();
    showView('hymnsList');
  });

  document.querySelectorAll('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'img--fallback';
      placeholder.textContent = img.dataset.fallback;
      img.replaceWith(placeholder);
    });
  });

  Promise.all([refreshCategoriesLibrary(), refreshHymnsLibrary()]).then(() => {
    renderCategoriesGrid();
    renderHymnsList();
    applyZoomLevel(0);
  });
});
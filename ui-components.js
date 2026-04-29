/**
 * مكونات واجهة المستخدم - إنشاء العناصر ديناميكياً
 * @module UIComponents
 * @requires Utils, CONFIG
 */
'use strict';

const UIComponents = (() => {
    /**
     * إنشاء عنصر DOM مع خصائص
     * @param {string} tag - نوع العنصر
     * @param {Object} options - الخيارات
     * @returns {HTMLElement} العنصر المنشأ
     */
    function createElement(tag, options = {}) {
        const element = document.createElement(tag);
        
        // تعيين الخصائص
        if (options.className) element.className = options.className;
        if (options.id) element.id = options.id;
        if (options.text) element.textContent = options.text;
        if (options.html) element.innerHTML = options.html;
        if (options.title) element.title = options.title;
        if (options.type) element.type = options.type;
        if (options.value !== undefined) element.value = options.value;
        if (options.placeholder) element.placeholder = options.placeholder;
        if (options.disabled) element.disabled = true;
        if (options.required) element.required = true;
        if (options.readonly) element.readOnly = true;
        if (options.checked) element.checked = true;
        if (options.href) element.href = options.href;
        if (options.target) element.target = options.target;
        if (options.src) element.src = options.src;
        if (options.alt) element.alt = options.alt;
        
        // تعيين السمات
        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        
        // تعيين الأنماط
        if (options.style) {
            Object.assign(element.style, options.style);
        }
        
        // تعيين الأحداث
        if (options.events) {
            Object.entries(options.events).forEach(([event, handler]) => {
                element.addEventListener(event, handler);
            });
        }
        
        // تعيين data attributes
        if (options.dataset) {
            Object.entries(options.dataset).forEach(([key, value]) => {
                element.dataset[key] = value;
            });
        }
        
        return element;
    }

    /**
     * إنشاء زر
     * @param {Object} options - خيارات الزر
     * @returns {HTMLButtonElement}
     */
    function createButton(options = {}) {
        const defaults = {
            tag: 'button',
            type: 'button',
            className: 'btn',
            events: {}
        };
        
        const config = { ...defaults, ...options };
        
        // إضافة نوع الزر
        if (config.variant) {
            config.className += ` btn-${config.variant}`;
        }
        if (config.size) {
            config.className += ` btn-${config.size}`;
        }
        
        // إضافة الأيقونة
        if (config.icon) {
            config.html = `<i class="fas ${config.icon}"></i> ${config.text || ''}`;
        }
        
        if (config.onClick) {
            config.events.click = config.onClick;
        }
        
        return createElement('button', config);
    }

    /**
     * إنشاء حقل إدخال مع تسمية
     * @param {Object} options - الخيارات
     * @returns {HTMLElement} مجموعة الحقل
     */
    function createFormField(options = {}) {
        const group = createElement('div', { className: 'form-group-modern' });
        
        // التسمية
        if (options.label) {
            const label = createElement('label', {
                text: options.label,
                attributes: { for: options.id }
            });
            
            if (options.required) {
                const star = createElement('span', {
                    text: ' *',
                    style: { color: 'var(--danger)' }
                });
                label.appendChild(star);
            }
            
            group.appendChild(label);
        }
        
        // حقل الإدخال
        let input;
        if (options.type === 'select') {
            input = createElement('select', {
                id: options.id,
                required: options.required,
                events: options.events
            });
            
            if (options.options) {
                options.options.forEach(opt => {
                    const option = createElement('option', {
                        value: opt.value || opt,
                        text: opt.label || opt,
                        selected: opt.selected
                    });
                    input.appendChild(option);
                });
            }
        } else if (options.type === 'textarea') {
            input = createElement('textarea', {
                id: options.id,
                placeholder: options.placeholder,
                value: options.value,
                required: options.required,
                rows: options.rows || 3,
                events: options.events
            });
        } else {
            input = createElement('input', {
                type: options.type || 'text',
                id: options.id,
                placeholder: options.placeholder,
                value: options.value,
                required: options.required,
                readonly: options.readonly,
                events: options.events
            });
        }
        
        group.appendChild(input);
        
        return group;
    }

    /**
     * إنشاء بطاقة إحصائية
     * @param {Object} options - الخيارات
     * @returns {HTMLElement}
     */
    function createStatCard(options = {}) {
        const card = createElement('div', {
            className: `stat-card ${options.cardClass || ''}`,
            style: options.color ? { borderTop: `3px solid ${options.color}` } : {},
            events: options.onClick ? { click: options.onClick } : {}
        });
        
        const icon = createElement('i', {
            className: `fas ${options.icon || 'fa-chart-bar'}`,
            style: { color: options.color || 'var(--primary)' }
        });
        
        const label = createElement('h3', { text: options.label || '' });
        const value = createElement('div', {
            className: 'value',
            text: options.value || '0',
            style: options.valueColor ? { color: options.valueColor } : {}
        });
        
        card.appendChild(icon);
        card.appendChild(label);
        card.appendChild(value);
        
        return card;
    }

    /**
     * إنشاء بطاقة منتج للبيع السريع
     * @param {Object} product - بيانات المنتج
     * @param {boolean} isSelected - هل محدد
     * @returns {HTMLElement}
     */
    function createProductCard(product, isSelected = false) {
        const card = createElement('div', {
            className: `quick-sale-product-card ${isSelected ? 'selected' : ''}`,
            events: {
                click: () => {
                    // سيتم تحديده من خلال التطبيق
                    App.onProductClick(product.id);
                }
            }
        });
        
        const icon = createElement('i', {
            className: `fas ${product.icon || 'fa-microchip'}`,
            style: { color: 'var(--primary)' }
        });
        
        const name = createElement('span', {
            className: 'name',
            text: product.name
        });
        
        const price = createElement('span', {
            className: 'price',
            text: Utils.formatCurrency(product.price)
        });
        
        card.appendChild(icon);
        card.appendChild(name);
        card.appendChild(price);
        
        return card;
    }

    /**
     * إنشاء عنصر في سلة الشراء
     * @param {Object} item - العنصر
     * @param {number} index - الفهرس
     * @returns {HTMLElement}
     */
    function createCartItem(item, index) {
        const cartItem = createElement('div', { className: 'quick-sale-cart-item' });
        
        const name = createElement('span', { text: item.name });
        
        const qtyControls = createElement('div', { className: 'item-qty-controls' });
        
        const minusBtn = createButton({
            className: 'qty-btn',
            text: '−',
            onClick: () => App.onChangeQuantity(index, -1)
        });
        
        const qtyDisplay = createElement('span', {
            text: item.qty.toString(),
            style: { fontWeight: '700', minWidth: '20px', textAlign: 'center' }
        });
        
        const plusBtn = createButton({
            className: 'qty-btn',
            text: '+',
            onClick: () => App.onChangeQuantity(index, 1)
        });
        
        qtyControls.appendChild(minusBtn);
        qtyControls.appendChild(qtyDisplay);
        qtyControls.appendChild(plusBtn);
        
        const total = createElement('span', {
            text: Utils.formatCurrency(item.total),
            style: { fontWeight: '700' }
        });
        
        cartItem.appendChild(name);
        cartItem.appendChild(qtyControls);
        cartItem.appendChild(total);
        
        return cartItem;
    }

    /**
     * إنشاء نافذة منبثقة (Modal)
     * @param {Object} options - الخيارات
     * @returns {HTMLElement}
     */
    function createModal(options = {}) {
        const modal = createElement('div', {
            id: options.id || `modal-${Date.now()}`,
            className: 'modal',
            events: {
                click: (e) => {
                    if (e.target === modal) {
                        closeModal(modal.id);
                    }
                }
            }
        });
        
        const content = createElement('div', { className: 'modal-content' });
        
        // زر الإغلاق
        const closeBtn = createButton({
            className: 'modal-close-btn',
            html: '<i class="fas fa-times"></i>',
            attributes: { 'aria-label': 'إغلاق' },
            onClick: () => closeModal(modal.id)
        });
        content.appendChild(closeBtn);
        
        // عنوان النافذة
        if (options.title) {
            const title = createElement('h3', {
                html: options.titleIcon ? 
                    `<i class="fas ${options.titleIcon}"></i> ${options.title}` : 
                    options.title
            });
            content.appendChild(title);
        }
        
        // محتوى النافذة
        if (options.content) {
            if (typeof options.content === 'string') {
                const body = createElement('div', { html: options.content });
                content.appendChild(body);
            } else {
                content.appendChild(options.content);
            }
        }
        
        // أزرار التذييل
        if (options.buttons) {
            const footer = createElement('div', { 
                className: 'flex-btns',
                style: { marginTop: '1rem' }
            });
            
            options.buttons.forEach(btn => {
                footer.appendChild(createButton(btn));
            });
            
            content.appendChild(footer);
        }
        
        modal.appendChild(content);
        
        // إضافة للنافذة الرئيسية
        let modalContainer = document.getElementById('modalContainer');
        if (!modalContainer) {
            modalContainer = createElement('div', { id: 'modalContainer' });
            document.body.appendChild(modalContainer);
        }
        modalContainer.appendChild(modal);
        
        return modal;
    }

    /**
     * فتح نافذة منبثقة
     * @param {string} modalId - معرف النافذة
     */
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
            
            // تركيز أول حقل إدخال
            const firstInput = modal.querySelector('input, select, textarea');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    /**
     * إغلاق نافذة منبثقة
     * @param {string} modalId - معرف النافذة
     */
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
    }

    /**
     * إغلاق جميع النوافذ المنبثقة
     */
    function closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
            modal.classList.remove('open');
        });
    }

    /**
     * إنشاء رسالة تأكيد
     * @param {Object} options - الخيارات
     * @returns {Promise<boolean>} نتيجة التأكيد
     */
    function showConfirm(options = {}) {
        return new Promise((resolve) => {
            const modalId = 'confirm-modal';
            let modal = document.getElementById(modalId);
            
            if (modal) {
                modal.remove();
            }
            
            modal = createModal({
                id: modalId,
                title: options.title || 'تأكيد',
                titleIcon: 'fa-exclamation-triangle',
                content: `<p>${options.message || 'هل أنت متأكد؟'}</p>`,
                buttons: [
                    {
                        text: 'إلغاء',
                        variant: 'outline',
                        onClick: () => {
                            closeModal(modalId);
                            resolve(false);
                        }
                    },
                    {
                        text: options.confirmText || 'تأكيد',
                        variant: options.confirmVariant || 'danger',
                        onClick: () => {
                            closeModal(modalId);
                            resolve(true);
                        }
                    }
                ]
            });
            
            openModal(modalId);
        });
    }

    /**
     * إنشاء نموذج إدخال سريع
     * @param {Object} options - الخيارات
     * @returns {Promise<string>} القيمة المدخلة
     */
    function showPrompt(options = {}) {
        return new Promise((resolve) => {
            const modalId = 'prompt-modal';
            let modal = document.getElementById(modalId);
            
            if (modal) {
                modal.remove();
            }
            
            const inputId = `prompt-input-${Date.now()}`;
            
            const content = createElement('div');
            content.appendChild(createFormField({
                id: inputId,
                label: options.label,
                type: options.type || 'text',
                placeholder: options.placeholder,
                value: options.value || '',
                required: options.required !== false
            }));
            
            modal = createModal({
                id: modalId,
                title: options.title || 'إدخال',
                content: content,
                buttons: [
                    {
                        text: 'إلغاء',
                        variant: 'outline',
                        onClick: () => {
                            closeModal(modalId);
                            resolve(null);
                        }
                    },
                    {
                        text: 'موافق',
                        variant: 'primary',
                        onClick: () => {
                            const value = document.getElementById(inputId)?.value;
                            closeModal(modalId);
                            resolve(value || null);
                        }
                    }
                ]
            });
            
            // إرسال بالضغط على Enter
            const inputElement = document.getElementById(inputId);
            if (inputElement) {
                inputElement.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const value = inputElement.value;
                        closeModal(modalId);
                        resolve(value || null);
                    }
                });
            }
            
            openModal(modalId);
        });
    }

    /**
     * إنشاء قائمة منسدلة للبحث
     * @param {Object} options - الخيارات
     * @returns {HTMLElement}
     */
    function createSearchableSelect(options = {}) {
        const container = createElement('div', { 
            className: 'multi-select-container',
            id: options.id 
        });
        
        const display = createElement('div', {
            className: 'multi-select-display',
            html: `<span style="color: var(--sub);">${options.placeholder || 'اختر...'}</span>`,
            events: {
                click: () => {
                    dropdown.classList.toggle('show');
                }
            }
        });
        
        const dropdown = createElement('div', { 
            className: 'multi-select-dropdown',
            id: `${options.id}-dropdown`
        });
        
        // إضافة خيار "الكل"
        if (options.showAll) {
            const allOption = createElement('label', {
                className: 'multi-select-option',
                html: `<input type="checkbox" checked> <span>الكل</span>`
            });
            dropdown.appendChild(allOption);
        }
        
        // إضافة الخيارات
        if (options.options) {
            options.options.forEach(opt => {
                const option = createElement('label', {
                    className: 'multi-select-option',
                    html: `<input type="checkbox" value="${Utils.sanitizeHTML(opt.value || opt)}" ${opt.selected ? 'checked' : ''}> ${Utils.sanitizeHTML(opt.label || opt)}`
                });
                dropdown.appendChild(option);
            });
        }
        
        container.appendChild(display);
        container.appendChild(dropdown);
        
        // إغلاق القائمة عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
        
        return container;
    }

    /**
     * إنشاء شريط تقدم
     * @param {Object} options - الخيارات
     * @returns {HTMLElement}
     */
    function createProgressBar(options = {}) {
        const container = createElement('div', { 
            className: 'progress-bar-container' 
        });
        
        const bar = createElement('div', {
            className: 'progress-bar',
            style: {
                width: `${Math.min(100, Math.max(0, options.value || 0))}%`,
                backgroundColor: options.color || 'var(--primary)',
                transition: 'width 0.3s ease'
            }
        });
        
        if (options.showLabel) {
            const label = createElement('span', {
                className: 'progress-label',
                text: `${options.value || 0}%`
            });
            bar.appendChild(label);
        }
        
        container.appendChild(bar);
        
        return container;
    }

    /**
     * إنشاء علامة (Badge)
     * @param {Object} options - الخيارات
     * @returns {HTMLElement}
     */
    function createBadge(options = {}) {
        const colors = {
            success: { bg: '#22c55e20', color: '#22c55e', border: '#22c55e' },
            warning: { bg: '#f59e0b20', color: '#f59e0b', border: '#f59e0b' },
            danger: { bg: '#ef444420', color: '#ef4444', border: '#ef4444' },
            info: { bg: '#3b82f620', color: '#3b82f6', border: '#3b82f6' },
            primary: { bg: '#6366f120', color: '#6366f1', border: '#6366f1' }
        };
        
        const colorSet = colors[options.variant || 'primary'] || colors.primary;
        
        return createElement('span', {
            className: `status-badge ${options.className || ''}`,
            text: options.text || '',
            style: {
                background: options.bgColor || colorSet.bg,
                color: options.textColor || colorSet.color,
                border: `1px solid ${options.borderColor || colorSet.border}`
            }
        });
    }

    /**
     * إنشاء بطاقة تحميل (Skeleton)
     * @param {Object} options - الخيارات
     * @returns {HTMLElement}
     */
    function createSkeleton(options = {}) {
        const skeleton = createElement('div', {
            className: 'skeleton-card',
            style: {
                background: 'var(--card)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem',
                marginBottom: '0.75rem'
            }
        });
        
        const lines = options.lines || 3;
        for (let i = 0; i < lines; i++) {
            const line = createElement('div', {
                className: 'skeleton-line',
                style: {
                    height: '1rem',
                    background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg) 50%, var(--bg-hover) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'skeleton-loading 1.5s infinite',
                    borderRadius: '0.5rem',
                    marginBottom: '0.5rem',
                    width: i === lines - 1 ? '60%' : '100%'
                }
            });
            skeleton.appendChild(line);
        }
        
        return skeleton;
    }

    // الواجهة العامة
    return {
        createElement,
        createButton,
        createFormField,
        createStatCard,
        createProductCard,
        createCartItem,
        createModal,
        openModal,
        closeModal,
        closeAllModals,
        showConfirm,
        showPrompt,
        createSearchableSelect,
        createProgressBar,
        createBadge,
        createSkeleton
    };
})();
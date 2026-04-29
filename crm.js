/**
 * نظام إدارة علاقات العملاء (CRM)
 * @module CRM
 * @requires StateManager, Utils, CONFIG, UIRenderer
 */
'use strict';

const CRM = (() => {
    // ==================== حالة CRM ====================
    
    let crmState = {
        filters: {
            stores: [],
            follow: '',
            rating: '',
            dateFrom: '',
            dateTo: ''
        },
        searchQuery: '',
        deleteTargetId: null
    };

    /**
     * تهيئة نظام CRM
     */
    function init() {
        // تحميل إعدادات CRM
        loadCRMSettings();
        
        // إعداد مستمعات الأحداث
        setupCRMEventListeners();
        
        // عرض البيانات
        renderAllCRM();
    }

    /**
     * تحميل إعدادات CRM
     */
    function loadCRMSettings() {
        const settings = StateManager.get('crmSettings');
        if (!settings) {
            StateManager.set('crmSettings', {
                stores: [...CONFIG.CRM.defaultStores],
                ratings: [...CONFIG.CRM.defaultRatings],
                followStatuses: [...CONFIG.CRM.defaultFollowStatuses]
            });
        }
    }

    /**
     * إعداد مستمعات الأحداث
     */
    function setupCRMEventListeners() {
        // مرشحات البحث
        const searchInput = document.getElementById('crmSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(() => {
                crmState.searchQuery = searchInput.value.toLowerCase();
                renderCRMTable();
            }, 300));
        }

        // أزرار التصفية
        document.getElementById('filterFollowSelect')?.addEventListener('change', (e) => {
            crmState.filters.follow = e.target.value;
            applyCRMFilters();
        });

        document.getElementById('filterRatingSelect')?.addEventListener('change', (e) => {
            crmState.filters.rating = e.target.value;
            applyCRMFilters();
        });

        document.getElementById('filterDateFrom')?.addEventListener('change', (e) => {
            crmState.filters.dateFrom = e.target.value;
            applyCRMFilters();
        });

        document.getElementById('filterDateTo')?.addEventListener('change', (e) => {
            crmState.filters.dateTo = e.target.value;
            applyCRMFilters();
        });

        // إعادة ضبط المرشحات
        document.getElementById('clearCRMFiltersBtn')?.addEventListener('click', resetCRMFilters);
    }

    /**
     * عرض جميع مكونات CRM
     */
    function renderAllCRM() {
        renderCRMStats();
        renderCRMTable();
        renderCRMFilters();
    }

    /**
     * عرض إحصائيات CRM
     */
    function renderCRMStats() {
        const customers = StateManager.get('crmCustomers') || [];
        const filtered = getFilteredCustomers();
        
        const stats = {
            total: customers.length,
            filtered: filtered.length,
            byFollow: {},
            byRating: {},
            newThisMonth: 0
        };

        // تجميع حسب حالة المتابعة
        CONFIG.CRM.defaultFollowStatuses.forEach(status => {
            stats.byFollow[status] = customers.filter(c => c.follow === status).length;
        });

        // تجميع حسب التقييم
        CONFIG.CRM.defaultRatings.forEach(rating => {
            stats.byRating[rating] = customers.filter(c => c.rating === rating).length;
        });

        // عملاء هذا الشهر
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        stats.newThisMonth = customers.filter(c => c.date >= monthStart).length;

        // عرض الإحصائيات
        renderStatsStrip(stats);
    }

    /**
     * عرض شريط الإحصائيات
     */
    function renderStatsStrip(stats) {
        const container = document.getElementById('crmStatsStrip');
        if (!container) return;

        container.innerHTML = '';
        
        // بطاقة الإجمالي
        const totalCard = UIComponents.createStatCard({
            icon: 'fa-users',
            label: 'إجمالي العملاء',
            value: stats.total.toString(),
            color: CONFIG.UI_COLORS.primary
        });
        
        container.appendChild(totalCard);
        
        // بطاقات حالات المتابعة
        Object.entries(CONFIG.CRM.followColors).forEach(([status, color]) => {
            const card = UIComponents.createStatCard({
                icon: getFollowIcon(status),
                label: status,
                value: (stats.byFollow[status] || 0).toString(),
                color: color,
                onClick: () => {
                    crmState.filters.follow = crmState.filters.follow === status ? '' : status;
                    document.getElementById('filterFollowSelect').value = crmState.filters.follow;
                    applyCRMFilters();
                }
            });
            container.appendChild(card);
        });
    }

    /**
     * الحصول على أيقونة حالة المتابعة
     */
    function getFollowIcon(status) {
        const icons = {
            'جديد': 'fa-star',
            'قيد المتابعة': 'fa-clock',
            'تم التواصل': 'fa-check-circle',
            'مغلق': 'fa-lock'
        };
        return icons[status] || 'fa-flag';
    }

    /**
     * عرض جدول CRM
     */
    function renderCRMTable() {
        const tbody = document.getElementById('crmTableBody');
        if (!tbody) return;

        const filtered = getFilteredCustomers();
        
        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="10">
                        <div class="no-data">
                            <i class="fas fa-inbox" style="font-size: 3rem; display: block; margin-bottom: 1rem;"></i>
                            <p>لا توجد نتائج مطابقة</p>
                            <button class="btn btn-outline btn-sm" onclick="CRM.resetCRMFilters()">
                                <i class="fas fa-undo"></i> إعادة ضبط المرشحات
                            </button>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        
        filtered.forEach(customer => {
            const row = createCRMTableRow(customer);
            fragment.appendChild(row);
        });
        
        tbody.innerHTML = '';
        tbody.appendChild(fragment);
    }

    /**
     * إنشاء صف في جدول CRM
     */
    function createCRMTableRow(customer) {
        const row = document.createElement('tr');
        
        // الاسم
        const nameCell = document.createElement('td');
        nameCell.appendChild(UIComponents.createElement('input', {
            className: 'inline-input',
            value: customer.name,
            dataset: { field: 'name', id: customer.id },
            events: {
                change: (e) => updateCustomerField(customer.id, 'name', e.target.value)
            }
        }));
        row.appendChild(nameCell);
        
        // الموبايل
        const phoneCell = document.createElement('td');
        const phoneInput = UIComponents.createElement('input', {
            className: 'inline-input',
            value: customer.phone,
            dataset: { field: 'phone', id: customer.id },
            events: {
                change: (e) => {
                    const cleanPhone = e.target.value.replace(/[^0-9]/g, '');
                    if (Utils.validatePhone(cleanPhone)) {
                        updateCustomerField(customer.id, 'phone', cleanPhone);
                    }
                }
            }
        });
        phoneCell.appendChild(phoneInput);
        row.appendChild(phoneCell);
        
        // التاريخ
        const dateCell = document.createElement('td');
        dateCell.appendChild(UIComponents.createElement('input', {
            type: 'date',
            className: 'inline-input',
            value: customer.date,
            dataset: { field: 'date', id: customer.id },
            events: {
                change: (e) => updateCustomerField(customer.id, 'date', e.target.value)
            }
        }));
        row.appendChild(dateCell);
        
        // المخزن
        const storeCell = document.createElement('td');
        storeCell.appendChild(createEditSelect(
            customer, 'store', 
            StateManager.get('crmSettings')?.stores || CONFIG.CRM.defaultStores,
            CONFIG.CRM.storeColors
        ));
        row.appendChild(storeCell);
        
        // التقييم
        const ratingCell = document.createElement('td');
        ratingCell.appendChild(createEditSelect(
            customer, 'rating',
            StateManager.get('crmSettings')?.ratings || CONFIG.CRM.defaultRatings,
            CONFIG.CRM.ratingColors
        ));
        row.appendChild(ratingCell);
        
        // حالة المتابعة
        const followCell = document.createElement('td');
        followCell.appendChild(createEditSelect(
            customer, 'follow',
            StateManager.get('crmSettings')?.followStatuses || CONFIG.CRM.defaultFollowStatuses,
            CONFIG.CRM.followColors
        ));
        row.appendChild(followCell);
        
        // ملاحظات
        const notesCell = document.createElement('td');
        notesCell.appendChild(UIComponents.createElement('input', {
            className: 'inline-input',
            value: customer.notes || '',
            placeholder: 'إضافة ملاحظة...',
            dataset: { field: 'notes', id: customer.id },
            events: {
                change: (e) => updateCustomerField(customer.id, 'notes', e.target.value)
            }
        }));
        row.appendChild(notesCell);
        
        // مرات التواصل
        const contactCell = document.createElement('td');
        const contactInput = UIComponents.createElement('input', {
            type: 'number',
            className: 'inline-input',
            value: customer.contact || 0,
            min: '0',
            style: { width: '60px' },
            dataset: { field: 'contact', id: customer.id },
            events: {
                change: (e) => updateCustomerField(customer.id, 'contact', Math.max(0, parseInt(e.target.value) || 0))
            }
        });
        contactCell.appendChild(contactInput);
        row.appendChild(contactCell);
        
        // واتساب
        const whatsappCell = document.createElement('td');
        const phoneNumber = customer.phone.replace(/[^0-9]/g, '');
        const whatsappLink = UIComponents.createElement('a', {
            href: `https://wa.me/2${phoneNumber}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'whatsapp-link',
            title: 'مراسلة واتساب',
            html: '<i class="fab fa-whatsapp"></i>'
        });
        whatsappCell.appendChild(whatsappLink);
        row.appendChild(whatsappCell);
        
        // إجراءات
        const actionsCell = document.createElement('td');
        actionsCell.className = 'action-icons';
        
        const editBtn = UIComponents.createButton({
            className: 'action-icon-btn',
            variant: 'edit',
            icon: 'fa-edit',
            title: 'تعديل',
            onClick: () => openEditCustomerModal(customer.id)
        });
        
        const deleteBtn = UIComponents.createButton({
            className: 'action-icon-btn',
            variant: 'danger',
            icon: 'fa-trash-alt',
            title: 'حذف',
            onClick: () => confirmDeleteCustomer(customer.id)
        });
        
        actionsCell.appendChild(editBtn);
        actionsCell.appendChild(deleteBtn);
        row.appendChild(actionsCell);
        
        return row;
    }

    /**
     * إنشاء قائمة منسدلة للتعديل المباشر
     */
    function createEditSelect(customer, field, options, colorMap) {
        const select = UIComponents.createElement('select', {
            className: 'inline-select',
            dataset: { field, id: customer.id },
            events: {
                change: (e) => updateCustomerField(customer.id, field, e.target.value)
            }
        });
        
        options.forEach(option => {
            const optionEl = UIComponents.createElement('option', {
                value: option,
                text: field === 'rating' ? `⭐ ${option}` : option,
                selected: customer[field] === option
            });
            select.appendChild(optionEl);
        });
        
        // تلوين الخلفية حسب القيمة
        if (colorMap && colorMap[customer[field]]) {
            select.style.backgroundColor = colorMap[customer[field]] + '20';
            select.style.color = colorMap[customer[field]];
            select.style.fontWeight = '600';
            select.style.borderColor = colorMap[customer[field]];
        }
        
        return select;
    }

    /**
     * تحديث حقل لعميل
     */
    function updateCustomerField(customerId, field, value) {
        const customers = StateManager.get('crmCustomers');
        const customer = customers.find(c => c.id === customerId);
        
        if (customer) {
            customer[field] = value;
            StateManager.set('crmCustomers', customers);
            DataManager.saveToStorage('crmCustomers', customers);
            
            // تحديث العرض
            renderCRMStats();
        }
    }

    /**
     * الحصول على العملاء المصفين
     */
    function getFilteredCustomers() {
        const customers = StateManager.get('crmCustomers') || [];
        
        return customers.filter(customer => {
            // بحث نصي
            if (crmState.searchQuery) {
                const nameMatch = customer.name.toLowerCase().includes(crmState.searchQuery);
                const phoneMatch = customer.phone.includes(crmState.searchQuery);
                if (!nameMatch && !phoneMatch) return false;
            }
            
            // مرشح المخازن
            if (crmState.filters.stores.length > 0) {
                if (!crmState.filters.stores.includes(customer.store)) return false;
            }
            
            // مرشح حالة المتابعة
            if (crmState.filters.follow) {
                if (customer.follow !== crmState.filters.follow) return false;
            }
            
            // مرشح التقييم
            if (crmState.filters.rating) {
                if (customer.rating !== crmState.filters.rating) return false;
            }
            
            // مرشح التاريخ
            if (crmState.filters.dateFrom) {
                if (customer.date < crmState.filters.dateFrom) return false;
            }
            
            if (crmState.filters.dateTo) {
                if (customer.date > crmState.filters.dateTo) return false;
            }
            
            return true;
        });
    }

    /**
     * تطبيق المرشحات
     */
    function applyCRMFilters() {
        renderCRMStats();
        renderCRMTable();
    }

    /**
     * إعادة ضبط المرشحات
     */
    function resetCRMFilters() {
        crmState = {
            ...crmState,
            filters: {
                stores: [],
                follow: '',
                rating: '',
                dateFrom: '',
                dateTo: ''
            },
            searchQuery: ''
        };
        
        // إعادة ضبط عناصر التحكم
        const searchInput = document.getElementById('crmSearchInput');
        if (searchInput) searchInput.value = '';
        
        document.getElementById('filterFollowSelect').value = '';
        document.getElementById('filterRatingSelect').value = '';
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        
        applyCRMFilters();
        UIRenderer.showToast('تم إعادة ضبط المرشحات', 'success');
    }

    /**
     * تأكيد حذف عميل
     */
    async function confirmDeleteCustomer(customerId) {
        const customers = StateManager.get('crmCustomers');
        const customer = customers.find(c => c.id === customerId);
        
        if (!customer) return;
        
        const confirmed = await UIComponents.showConfirm({
            title: 'حذف عميل',
            message: `هل أنت متأكد من حذف "${customer.name}"؟`,
            confirmText: 'نعم، احذف',
            confirmVariant: 'danger'
        });
        
        if (confirmed) {
            deleteCustomer(customerId);
        }
    }

    /**
     * حذف عميل
     */
    function deleteCustomer(customerId) {
        const customers = StateManager.get('crmCustomers');
        const customer = customers.find(c => c.id === customerId);
        
        const filtered = customers.filter(c => c.id !== customerId);
        StateManager.set('crmCustomers', filtered);
        DataManager.saveToStorage('crmCustomers', filtered);
        
        StateManager.addLog('حذف عميل CRM', customer?.name || 'غير معروف');
        UIRenderer.showToast(`تم حذف "${customer?.name || 'العميل'}"`, 'success');
        
        renderAllCRM();
    }

    /**
     * فتح نافذة إضافة/تعديل عميل
     */
    function openEditCustomerModal(customerId = null) {
        const customers = StateManager.get('crmCustomers');
        const customer = customerId ? customers.find(c => c.id === customerId) : null;
        const isEdit = !!customer;
        
        const modalId = 'crmCustomerModal';
        let modal = document.getElementById(modalId);
        
        if (modal) {
            modal.remove();
        }
        
        const content = document.createElement('div');
        
        // حقل الاسم
        content.appendChild(UIComponents.createFormField({
            id: 'crmCustomerName',
            label: 'الاسم',
            type: 'text',
            placeholder: 'اسم العميل الكامل',
            value: customer?.name || '',
            required: true
        }));
        
        // حقل الهاتف
        content.appendChild(UIComponents.createFormField({
            id: 'crmCustomerPhone',
            label: 'رقم الهاتف',
            type: 'text',
            placeholder: '01xxxxxxxxx',
            value: customer?.phone || '',
            required: true
        }));
        
        // حقل التاريخ
        content.appendChild(UIComponents.createFormField({
            id: 'crmCustomerDate',
            label: 'تاريخ الإضافة',
            type: 'date',
            value: customer?.date || new Date().toISOString().slice(0, 10)
        }));
        
        // حقل المخزن
        content.appendChild(UIComponents.createFormField({
            id: 'crmCustomerStore',
            label: 'المخزن',
            type: 'select',
            options: (StateManager.get('crmSettings')?.stores || CONFIG.CRM.defaultStores).map(s => ({
                value: s,
                label: s,
                selected: customer?.store === s
            }))
        }));
        
        // حقل التقييم (للتعديل فقط)
        if (isEdit) {
            content.appendChild(UIComponents.createFormField({
                id: 'crmCustomerRating',
                label: 'التقييم',
                type: 'select',
                options: (StateManager.get('crmSettings')?.ratings || CONFIG.CRM.defaultRatings).map(r => ({
                    value: r,
                    label: `⭐ ${r}`,
                    selected: customer?.rating === r
                }))
            }));
            
            content.appendChild(UIComponents.createFormField({
                id: 'crmCustomerContact',
                label: 'مرات التواصل',
                type: 'number',
                value: customer?.contact || 0,
                min: '0'
            }));
        }
        
        // حقل المتابعة
        content.appendChild(UIComponents.createFormField({
            id: 'crmCustomerFollow',
            label: 'حالة المتابعة',
            type: 'select',
            options: (StateManager.get('crmSettings')?.followStatuses || CONFIG.CRM.defaultFollowStatuses).map(f => ({
                value: f,
                label: f,
                selected: customer?.follow === f
            }))
        }));
        
        // حقل الملاحظات
        content.appendChild(UIComponents.createFormField({
            id: 'crmCustomerNotes',
            label: 'ملاحظات',
            type: 'textarea',
            placeholder: 'أي ملاحظات إضافية...',
            value: customer?.notes || '',
            rows: 3
        }));
        
        modal = UIComponents.createModal({
            id: modalId,
            title: isEdit ? 'تعديل عميل' : 'إضافة عميل جديد',
            titleIcon: isEdit ? 'fa-user-edit' : 'fa-user-plus',
            content: content,
            buttons: [
                {
                    text: 'إلغاء',
                    variant: 'outline',
                    onClick: () => UIComponents.closeModal(modalId)
                },
                {
                    text: isEdit ? 'تحديث' : 'إضافة',
                    variant: 'success',
                    onClick: () => saveCustomer(customerId, isEdit)
                }
            ]
        });
        
        UIComponents.openModal(modalId);
    }

    /**
     * حفظ العميل
     */
    function saveCustomer(customerId, isEdit) {
        const name = document.getElementById('crmCustomerName')?.value.trim();
        const phone = document.getElementById('crmCustomerPhone')?.value.trim();
        
        // التحقق من البيانات
        if (!name) {
            UIRenderer.showToast('الاسم مطلوب', 'error');
            return;
        }
        
        if (!phone || !Utils.validatePhone(phone)) {
            UIRenderer.showToast('رقم هاتف غير صالح', 'error');
            return;
        }
        
        const customerData = {
            name,
            phone: phone.replace(/[^0-9]/g, ''),
            date: document.getElementById('crmCustomerDate')?.value || new Date().toISOString().slice(0, 10),
            store: document.getElementById('crmCustomerStore')?.value || CONFIG.CRM.defaultStores[0],
            follow: document.getElementById('crmCustomerFollow')?.value || CONFIG.CRM.defaultFollowStatuses[0],
            notes: document.getElementById('crmCustomerNotes')?.value || ''
        };
        
        if (isEdit) {
            customerData.rating = document.getElementById('crmCustomerRating')?.value || CONFIG.CRM.defaultRatings[0];
            customerData.contact = parseInt(document.getElementById('crmCustomerContact')?.value) || 0;
        } else {
            customerData.rating = CONFIG.CRM.defaultRatings[0];
            customerData.contact = 0;
        }
        
        const customers = StateManager.get('crmCustomers');
        
        if (isEdit) {
            const index = customers.findIndex(c => c.id === customerId);
            if (index !== -1) {
                customers[index] = { ...customers[index], ...customerData };
            }
        } else {
            // التحقق من عدم وجود رقم الهاتف
            const exists = customers.find(c => c.phone === customerData.phone);
            if (exists) {
                UIRenderer.showToast('هذا الرقم مسجل بالفعل', 'warning');
                return;
            }
            
            customers.push({
                id: Utils.generateId(),
                ...customerData
            });
        }
        
        StateManager.set('crmCustomers', customers);
        DataManager.saveToStorage('crmCustomers', customers);
        
        StateManager.addLog(isEdit ? 'تعديل عميل CRM' : 'إضافة عميل CRM', name);
        UIRenderer.showToast(isEdit ? 'تم تحديث العميل' : 'تمت إضافة العميل', 'success');
        
        UIComponents.closeModal('crmCustomerModal');
        renderAllCRM();
    }

    /**
     * عرض مرشحات CRM
     */
    function renderCRMFilters() {
        // تحديث قائمة المخازن في المرشحات
        const storeDropdown = document.getElementById('crmStoreFilter');
        if (storeDropdown) {
            storeDropdown.innerHTML = '';
            const stores = StateManager.get('crmSettings')?.stores || CONFIG.CRM.defaultStores;
            
            stores.forEach(store => {
                const label = document.createElement('label');
                label.className = 'multi-select-option';
                label.innerHTML = `
                    <input type="checkbox" value="${Utils.sanitizeHTML(store)}" 
                           ${crmState.filters.stores.includes(store) ? 'checked' : ''}
                           onchange="CRM.toggleStoreFilter('${Utils.sanitizeHTML(store)}', this.checked)">
                    ${Utils.sanitizeHTML(store)}
                `;
                storeDropdown.appendChild(label);
            });
        }
    }

    /**
     * تبديل مرشح المخزن
     */
    function toggleStoreFilter(store, checked) {
        if (checked) {
            if (!crmState.filters.stores.includes(store)) {
                crmState.filters.stores.push(store);
            }
        } else {
            crmState.filters.stores = crmState.filters.stores.filter(s => s !== store);
        }
        applyCRMFilters();
    }

    /**
     * تصدير تقرير CRM إلى Excel
     */
    function exportCRMToExcel() {
        const customers = getFilteredCustomers();
        
        const data = [
            ['الاسم', 'الهاتف', 'التاريخ', 'المخزن', 'التقييم', 'حالة المتابعة', 'ملاحظات', 'مرات التواصل']
        ];
        
        customers.forEach(c => {
            data.push([
                c.name,
                c.phone,
                c.date,
                c.store,
                c.rating,
                c.follow,
                c.notes || '',
                c.contact || 0
            ]);
        });
        
        Utils.exportToCSV(data, `تقرير_العملاء_${new Date().toISOString().slice(0, 10)}`);
        UIRenderer.showToast('تم تصدير تقرير العملاء', 'success');
    }

    /**
     * استيراد عملاء من Excel
     */
    function importCRMFromExcel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const workbook = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
                        const sheet = workbook.Sheets[workbook.SheetNames[0]];
                        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                        
                        let importedCount = 0;
                        const customers = StateManager.get('crmCustomers');
                        
                        for (let i = 1; i < rows.length; i++) {
                            const row = rows[i];
                            if (row[0] && row[1]) {
                                const phone = String(row[1]).replace(/[^0-9]/g, '');
                                if (Utils.validatePhone(phone)) {
                                    // التحقق من عدم التكرار
                                    if (!customers.find(c => c.phone === phone)) {
                                        customers.push({
                                            id: Utils.generateId(),
                                            name: String(row[0]).trim(),
                                            phone: phone,
                                            date: row[2] || new Date().toISOString().slice(0, 10),
                                            store: row[3] || CONFIG.CRM.defaultStores[0],
                                            rating: row[4] || CONFIG.CRM.defaultRatings[0],
                                            follow: row[5] || CONFIG.CRM.defaultFollowStatuses[0],
                                            notes: row[6] || '',
                                            contact: parseInt(row[7]) || 0
                                        });
                                        importedCount++;
                                    }
                                }
                            }
                        }
                        
                        if (importedCount > 0) {
                            StateManager.set('crmCustomers', customers);
                            DataManager.saveToStorage('crmCustomers', customers);
                            renderAllCRM();
                            UIRenderer.showToast(`تم استيراد ${importedCount} عميل`, 'success');
                        } else {
                            UIRenderer.showToast('لا توجد بيانات صالحة للاستيراد', 'warning');
                        }
                    } catch (error) {
                        console.error('خطأ في قراءة الملف:', error);
                        UIRenderer.showToast('خطأ في قراءة الملف', 'error');
                    }
                };
                reader.readAsArrayBuffer(file);
            } catch (error) {
                UIRenderer.showToast('خطأ في فتح الملف', 'error');
            }
        };
        
        input.click();
    }

    // ==================== الواجهة العامة ====================
    return {
        init,
        renderAllCRM,
        applyCRMFilters,
        resetCRMFilters,
        toggleStoreFilter,
        openEditCustomerModal,
        exportCRMToExcel,
        importCRMFromExcel,
        deleteCustomer
    };
})();
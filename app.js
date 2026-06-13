// 记账应用主逻辑
class AccountingApp {
    constructor() {
        this.records = [];
        this.budgets = {};
        this.currentType = '支出';
        this.useCloud = (typeof window._supabase !== 'undefined' && window._supabase !== null);
        this.init();
    }

    // 初始化应用
    async init() {
        await this.loadData();
        this.setTodayDate();
        this.bindEvents();
        this.bindQueryEvent();
        this.bindTabEvents();
        this.renderTodayRecords();
        this.updateStatistics();
        this.updateBudgetDisplay();
        this.renderAssets();
        this.renderAnnual();
    }

    // 加载所有数据
    async loadData() {
        if (this.useCloud) {
            await this.loadCloudData();
        } else {
            this.loadLocalData();
        }
    }

    // 从云端加载数据
    async loadCloudData() {
        try {
            // 加载记录
            const { data: records, error: recordsError } = await window._supabase
                .from('records')
                .select('*')
                .order('date', { ascending: false });
            
            if (recordsError) throw recordsError;
            this.records = records || [];

            // 加载预算
            const { data: budgets, error: budgetsError } = await window._supabase
                .from('budgets')
                .select('*');
            
            if (budgetsError) throw budgetsError;
            
            this.budgets = {};
            (budgets || []).forEach(b => {
                this.budgets[b.month] = b.amount;
            });

            console.log(`✅ 云端数据加载成功：${this.records.length}条记录`);
        } catch (error) {
            console.error('❌ 云端数据加载失败，回退到本地存储：', error);
            this.useCloud = false;
            this.loadLocalData();
        }
    }

    // 从本地加载数据
    loadLocalData() {
        this.records = this.loadRecords();
        this.budgets = this.loadBudgets();
    }

    // 绑定标签页事件
    bindTabEvents() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.currentTarget.dataset.tab;
                this.switchTab(tabId);
            });
        });
    }

    // 切换标签页
    switchTab(tabId) {
        // 更新按钮状态
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabId) btn.classList.add('active');
        });

        // 更新内容显示
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');

        // 只在记账页显示顶部预算概览
        const header = document.querySelector('.header');
        if (header) header.style.display = (tabId === 'tabToday') ? 'block' : 'none';

        // 如果切换到月度明细标签，自动查询当前月
        if (tabId === 'tabMonthly') {
            const queryMonth = document.getElementById('queryMonth').value;
            if (queryMonth) this.queryMonthlyDetail(queryMonth);
        }
        // 切换到收入标签，自动加载
        if (tabId === 'tabIncome') {
            const incomeMonth = document.getElementById('incomeMonth').value;
            if (incomeMonth) this.loadIncomeRecords(incomeMonth);
        }
        // 切换到资产标签，渲染资产
        if (tabId === 'tabAssets') {
            this.renderAssets();
        }
        // 切换到年费标签
        if (tabId === 'tabAnnual') {
            this.renderAnnual();
        }
    }

    // 设置默认日期为今天
    setTodayDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').value = today;
        const incomeDate = document.getElementById('incomeDate');
        if (incomeDate) incomeDate.value = today;
    }

    // 绑定事件
    bindEvents() {
        // 支出表单提交
        const form = document.getElementById('recordForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRecord();
        });

        // 收入表单提交
        const incomeForm = document.getElementById('incomeForm');
        if (incomeForm) {
            incomeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveIncomeRecord();
            });
        }
    }

    // 绑定查询事件
    bindQueryEvent() {
        // 月度明细月份选择
        const queryMonthInput = document.getElementById('queryMonth');
        if (queryMonthInput) {
            const now = new Date();
            const currentMonth = now.toISOString().slice(0, 7);
            queryMonthInput.value = currentMonth;
            queryMonthInput.addEventListener('change', (e) => {
                this.queryMonthlyDetail(e.target.value);
            });
        }

        // 收入记录月份选择
        const incomeMonthInput = document.getElementById('incomeMonth');
        if (incomeMonthInput) {
            const now = new Date();
            incomeMonthInput.value = now.toISOString().slice(0, 7);
            incomeMonthInput.addEventListener('change', (e) => {
                this.loadIncomeRecords(e.target.value);
            });
        }
    }

    // 切换类型（支出/收入）
    switchType(type) {
        this.currentType = type;
        
        // 更新按钮状态
        const typeButtons = document.querySelectorAll('.btn-type');
        typeButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.type === type) {
                btn.classList.add('active');
            }
        });

        // 更新隐藏输入框
        document.getElementById('type').value = type;

        // 切换分类显示
        const expenseCategories = document.getElementById('expenseCategories');
        const incomeCategories = document.getElementById('incomeCategories');
        
        if (type === '支出') {
            expenseCategories.style.display = 'block';
            incomeCategories.style.display = 'none';
            // 选择第一个支出分类
            expenseCategories.querySelector('option[value="生活支出"]').selected = true;
        } else {
            expenseCategories.style.display = 'none';
            incomeCategories.style.display = 'block';
            // 选择第一个收入分类
            incomeCategories.querySelector('option[value="陈都行工资"]').selected = true;
        }
    }

    // 保存支出记录
    saveRecord() {
        const form = document.getElementById('recordForm');
        const recordId = document.getElementById('recordId') ? document.getElementById('recordId').value : null;
        const record = this.collectFormData(form, recordId, '支出');
        if (!record) return;
        this.processRecord(record, recordId);
    }

    // 保存收入记录
    saveIncomeRecord() {
        const form = document.getElementById('incomeForm');
        const record = this.collectFormData(form, null, '收入');
        if (!record) return;
        this.processRecord(record, null);
        form.reset();
        document.getElementById('incomeDate').value = new Date().toISOString().split('T')[0];
    }

    // 收集表单数据
    collectFormData(form, recordId, type) {
        const data = new FormData(form);
        const record = {
            id: recordId ? parseInt(recordId) : Date.now(),
            date: data.get('date'),
            type: type,
            category: data.get('category'),
            amount: parseFloat(data.get('amount')),
            note: data.get('note') || '',
            timestamp: new Date().toISOString()
        };
        if (!record.date || !record.category || !record.amount) {
            this.showToast('❌ 请填写完整信息', 'error');
            return null;
        }
        return record;
    }

    // 处理记录（新增或更新）
    processRecord(record, recordId) {
        if (recordId) {
            const index = this.records.findIndex(r => r.id === record.id);
            if (index !== -1) this.records[index] = record;
            this.showToast('✅ 记录修改成功！', 'success');
        } else {
            this.records.push(record);
            this.showToast('✅ 记录保存成功！', 'success');
        }
        this.persistData();
        this.renderTodayRecords();
        this.updateStatistics();
        const qm = document.getElementById('queryMonth');
        if (qm && qm.value) this.queryMonthlyDetail(qm.value);
        const im = document.getElementById('incomeMonth');
        if (im && im.value) this.loadIncomeRecords(im.value);
        this.resetForm();
    }

    // 编辑记录
    editRecord(id) {
        const record = this.records.find(r => r.id === id);
        if (!record) { this.showToast('❌ 记录不存在', 'error'); return; }

        const isIncome = record.type === '收入';
        const form = isIncome ? 'incomeForm' : 'recordForm';
        document.getElementById(isIncome ? 'incomeDate' : 'date').value = record.date;
        document.getElementById(isIncome ? 'incomeCategory' : 'category').value = record.category;
        document.getElementById(isIncome ? 'incomeAmount' : 'amount').value = record.amount;
        document.getElementById(isIncome ? 'incomeNote' : 'note').value = record.note || '';

        let recordIdInput = document.getElementById('recordId');
        if (!recordIdInput) {
            recordIdInput = document.createElement('input');
            recordIdInput.type = 'hidden';
            recordIdInput.id = 'recordId';
            document.getElementById(form).appendChild(recordIdInput);
        }
        recordIdInput.value = id;

        const submitBtn = document.getElementById(form).querySelector('.btn-submit');
        submitBtn.textContent = '✅ 更新记录';
        submitBtn.style.background = 'linear-gradient(135deg, #F39C12, #F1C40F)';

        // 切换到对应标签
        this.switchTab(isIncome ? 'tabIncome' : 'tabToday');
        document.getElementById(form).scrollIntoView({ behavior: 'smooth' });
        this.showToast('📝 正在编辑记录...', 'info');
    }

    // 取消编辑
    cancelEdit() {
        this.resetForm();
        this.showToast('❌ 已取消编辑', 'info');
    }

    // 重置表单
    resetForm() {
        const form = document.getElementById('recordForm');
        form.reset();
        this.setTodayDate();
        document.getElementById('recordId').value = '';
        const submitBtn = form.querySelector('.btn-submit');
        submitBtn.textContent = '✅ 记一笔支出';
        submitBtn.style.background = 'linear-gradient(135deg, #70AD47, #8BC34A)';
    }

    // 删除记录
    deleteRecord(id) {
        const record = this.records.find(r => r.id === id);
        if (!record) {
            this.showToast('❌ 记录不存在', 'error');
            return;
        }

        // 确认删除
        const confirmMsg = `确定要删除这条记录吗？\n\n日期：${record.date}\n分类：${record.category}\n金额：${record.type === '支出' ? '-' : '+'}¥${record.amount.toFixed(2)}\n备注：${record.note || '无'}`;
        
        if (confirm(confirmMsg)) {
            this.records = this.records.filter(r => r.id !== id);
            this.persistData();
            
            // 更新界面
            this.renderTodayRecords();
            this.updateStatistics();
            this.updateBudgetDisplay();
            
            // 如果月度明细标签正在显示，也更新它
            const monthlyTab = document.getElementById('tabMonthly');
            if (monthlyTab.classList.contains('active')) {
                const queryMonth = document.getElementById('queryMonth').value;
                this.queryMonthlyDetail(queryMonth);
            }
            
            this.showToast('🗑️ 记录已删除', 'success');
        }
    }

    // 渲染今日记录
    renderTodayRecords() {
        const today = new Date().toISOString().split('T')[0];
        const todayRecords = this.records.filter(r => r.date && r.date === today);
        
        const container = document.getElementById('todayRecords');
        
        if (todayRecords.length === 0) {
            container.innerHTML = '<p class="empty-message">今天还没有记录</p>';
        } else {
            container.innerHTML = this.buildTable(todayRecords, false, false);
        }

        // 计算今日统计
        const todayExpense = todayRecords
            .filter(r => r.type === '支出')
            .reduce((sum, r) => sum + r.amount, 0);
        
        const todayIncome = todayRecords
            .filter(r => r.type === '收入')
            .reduce((sum, r) => sum + r.amount, 0);

        document.getElementById('todayExpense').textContent = `¥${todayExpense.toFixed(2)}`;
        document.getElementById('todayIncome').textContent = `¥${todayIncome.toFixed(2)}`;
    }

    // 创建记录HTML - 表格行样式
    createRecordHTML(record, showDate = false, showType = false) {
        const typeClass = record.type === '支出' ? 'expense' : 'income';
        const sign = record.type === '支出' ? '-' : '+';
        
        return `
            <tr class="record-row">
                ${showDate ? `<td class="col-date">${record.date.slice(5)}</td>` : ''}
                ${showType ? `<td class="col-type"><span class="tag ${typeClass}">${record.type}</span></td>` : ''}
                <td class="col-category">${record.category}</td>
                <td class="col-amount ${typeClass}">${sign}¥${record.amount.toFixed(2)}</td>
                <td class="col-note">${record.note || ''}</td>
                <td class="col-actions">
                    <button class="btn-edit" onclick="app.editRecord(${record.id})">✏️</button>
                    <button class="btn-delete" onclick="app.deleteRecord(${record.id})">🗑️</button>
                </td>
            </tr>
        `;
    }

    // 构建表格HTML
    buildTable(records, showDate, showType) {
        if (records.length === 0) {
            return '<p class="empty-message">暂无记录</p>';
        }
        let cols = '';
        if (showDate) cols += '<th>日期</th>';
        if (showType) cols += '<th>类型</th>';
        cols += '<th>分类</th><th>金额</th><th>备注</th><th></th>';
        
        return `
            <table class="record-table">
                <thead><tr>${cols}</tr></thead>
                <tbody>${records.map(r => this.createRecordHTML(r, showDate, showType)).join('')}</tbody>
            </table>
        `;
    }

    // 加载收入记录
    loadIncomeRecords(month) {
        if (!month) return;
        
        const incomeRecords = this.records
            .filter(r => r.date.startsWith(month) && r.type === '收入')
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        const expenseRecords = this.records
            .filter(r => r.date.startsWith(month) && r.type === '支出');

        const container = document.getElementById('incomeRecords');
        const summaryDiv = document.getElementById('incomeSummary');
        
        if (incomeRecords.length === 0) {
            container.innerHTML = '<p class="empty-message">该月没有收入记录</p>';
            summaryDiv.style.display = 'none';
            return;
        }

        container.innerHTML = this.buildTable(incomeRecords, true, false);

        const totalIncome = incomeRecords.reduce((s, r) => s + r.amount, 0);
        const totalExpense = expenseRecords.reduce((s, r) => s + r.amount, 0);
        const balance = totalIncome - totalExpense;

        document.getElementById('incomeTotal').textContent = `¥${totalIncome.toFixed(2)}`;
        document.getElementById('incomeExpense').textContent = `¥${totalExpense.toFixed(2)}`;
        const balEl = document.getElementById('incomeBalance');
        balEl.textContent = `¥${balance.toFixed(2)}`;
        balEl.className = `amount ${balance >= 0 ? 'income' : 'expense'}`;
        summaryDiv.style.display = 'block';
    }

    // 更新统计信息（顶部概览用）
    updateStatistics() {
        this.updateBudgetDisplay();
    }

    // ===== 以下是原有的辅助方法 =====

    // 查询月度明细
    queryMonthlyDetail(month) {
        if (!month) {
            return;
        }

        const monthRecords = this.records
            .filter(r => r.date.startsWith(month))
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // 按日期倒序
        
        const container = document.getElementById('monthlyDetail');
        const summaryDiv = document.getElementById('monthlySummary');
        const categoryStatsDiv = document.getElementById('categoryStats');
        
        if (monthRecords.length === 0) {
            container.innerHTML = '<p class="empty-message">该月还没有记录</p>';
            summaryDiv.style.display = 'none';
            categoryStatsDiv.style.display = 'none';
            this.updateBudgetDisplay();
            return;
        }

        // 显示明细表格
        container.innerHTML = this.buildTable(monthRecords, true, true);
        
        // 计算并显示统计
        const monthExpense = monthRecords
            .filter(r => r.type === '支出')
            .reduce((sum, r) => sum + r.amount, 0);
        
        // 获取当月预算
        const budget = this.budgets[month] || this.budgets.default || 0;
        const remaining = budget - monthExpense;

        document.getElementById('detailBudget').textContent = `¥${budget.toFixed(2)}`;
        document.getElementById('detailExpense').textContent = `¥${monthExpense.toFixed(2)}`;
        
        const remEl = document.getElementById('detailRemaining');
        remEl.textContent = `¥${remaining.toFixed(2)}`;
        remEl.className = `amount ${remaining >= 0 ? 'income' : 'expense'}`;
        
        summaryDiv.style.display = 'block';
        
        // 显示分类统计
        this.renderCategoryStats(monthRecords, monthExpense, monthIncome);
        categoryStatsDiv.style.display = 'block';
        
        // 更新预算显示
        this.updateBudgetDisplay();
    }

    // 渲染分类统计
    renderCategoryStats(records, totalExpense, totalIncome) {
        // 支出分类统计
        const expenseRecords = records.filter(r => r.type === '支出');
        const expenseCategoryMap = {};
        expenseRecords.forEach(r => {
            if (!expenseCategoryMap[r.category]) {
                expenseCategoryMap[r.category] = 0;
            }
            expenseCategoryMap[r.category] += r.amount;
        });

        const expenseCategoryStats = document.getElementById('expenseCategoryStats');
        if (expenseRecords.length > 0) {
            let html = '<h4 style="color: #E74C3C; margin-bottom: 8px;">💸 支出分类</h4>';
            for (const [category, amount] of Object.entries(expenseCategoryMap).sort((a, b) => b[1] - a[1])) {
                const percentage = ((amount / totalExpense) * 100).toFixed(1);
                html += `
                    <div class="stat-item" style="padding: 8px; margin-bottom: 6px;">
                        <span class="stat-label">${category}</span>
                        <span class="stat-value expense">¥${amount.toFixed(2)} (${percentage}%)</span>
                    </div>
                `;
            }
            expenseCategoryStats.innerHTML = html;
        } else {
            expenseCategoryStats.innerHTML = '';
        }

        // 收入分类统计
        const incomeRecords = records.filter(r => r.type === '收入');
        const incomeCategoryMap = {};
        incomeRecords.forEach(r => {
            if (!incomeCategoryMap[r.category]) {
                incomeCategoryMap[r.category] = 0;
            }
            incomeCategoryMap[r.category] += r.amount;
        });

        const incomeCategoryStats = document.getElementById('incomeCategoryStats');
        if (incomeRecords.length > 0) {
            let html = '<h4 style="color: #70AD47; margin-bottom: 8px; margin-top: 16px;">💰 收入分类</h4>';
            for (const [category, amount] of Object.entries(incomeCategoryMap).sort((a, b) => b[1] - a[1])) {
                const percentage = ((amount / totalIncome) * 100).toFixed(1);
                html += `
                    <div class="stat-item" style="padding: 8px; margin-bottom: 6px;">
                        <span class="stat-label">${category}</span>
                        <span class="stat-value income">¥${amount.toFixed(2)} (${percentage}%)</span>
                    </div>
                `;
            }
            incomeCategoryStats.innerHTML = html;
        } else {
            incomeCategoryStats.innerHTML = '';
        }
    }

    // 切换预算设置类型
    toggleBudgetType() {
        const budgetType = document.getElementById('budgetType').value;
        const defaultGroup = document.getElementById('defaultBudgetGroup');
        const monthlyGroup = document.getElementById('monthlyBudgetGroup');
        
        if (budgetType === 'default') {
            defaultGroup.style.display = 'block';
            monthlyGroup.style.display = 'none';
            
            // 显示当前默认预算
            const defaultBudget = this.budgets.default || 0;
            document.getElementById('defaultBudget').value = defaultBudget > 0 ? defaultBudget : '';
        } else {
            defaultGroup.style.display = 'none';
            monthlyGroup.style.display = 'block';
            
            // 显示当前月份单独设置的预算
            const currentMonth = new Date().toISOString().slice(0, 7);
            const monthlyBudget = this.budgets[currentMonth] || 0;
            document.getElementById('monthlyBudgetInput').value = monthlyBudget > 0 ? monthlyBudget : '';
        }
    }

    // 显示预算设置弹窗
    showBudgetModal() {
        const modal = document.getElementById('budgetModal');
        modal.style.display = 'flex';
        
        // 重置为默认预算设置
        document.getElementById('budgetType').value = 'default';
        this.toggleBudgetType();
    }

    // 关闭预算设置弹窗
    closeBudgetModal() {
        const modal = document.getElementById('budgetModal');
        modal.style.display = 'none';
    }

    // 保存预算
    saveBudget() {
        const budgetType = document.getElementById('budgetType').value;
        
        if (budgetType === 'default') {
            // 保存默认预算
            const amount = parseFloat(document.getElementById('defaultBudget').value);
            
            if (!amount || amount <= 0) {
                this.showToast('❌ 请输入有效的预算金额', 'error');
                return;
            }
            
            this.budgets.default = amount;
            this.persistData();
            this.closeBudgetModal();
            this.updateBudgetDisplay();
            
            this.showToast(`✅ 年度默认预算已设置为¥${amount.toFixed(2)}`, 'success');
        } else {
            // 保存本月单独预算
            const currentMonth = new Date().toISOString().slice(0, 7);
            const amount = parseFloat(document.getElementById('monthlyBudgetInput').value);
            
            if (!amount || amount <= 0) {
                this.showToast('❌ 请输入有效的预算金额', 'error');
                return;
            }
            
            this.budgets[currentMonth] = amount;
            this.persistData();
            this.closeBudgetModal();
            this.updateBudgetDisplay();
            
            this.showToast(`✅ ${currentMonth}预算已设置为¥${amount.toFixed(2)}`, 'success');
        }
    }

    // 重置本月预算（使用默认预算）
    resetMonthBudget() {
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        if (this.budgets[currentMonth]) {
            const confirmMsg = `确定要重置${currentMonth}的预算吗？\n重置后将使用年度默认预算。`;
            if (confirm(confirmMsg)) {
                delete this.budgets[currentMonth];
                this.persistData();
                this.updateBudgetDisplay();
                this.closeBudgetModal();
                this.showToast('🔄 本月预算已重置，将使用默认预算', 'success');
            }
        } else {
            this.showToast('ℹ️ 该月未单独设置预算', 'info');
        }
    }

    // 更新预算显示
    updateBudgetDisplay() {
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        // 获取预算：优先使用月度单独设置，否则使用默认预算
        let budget = this.budgets[currentMonth] || this.budgets.default || 0;
        
        // 计算当月已用预算（总支出）
        const monthRecords = this.records.filter(r => r.date && r.date.startsWith(currentMonth));
        const usedBudget = monthRecords
            .filter(r => r.type === '支出')
            .reduce((sum, r) => sum + r.amount, 0);
        
        const remainingBudget = budget - usedBudget;
        const progress = budget > 0 ? (usedBudget / budget) * 100 : 0;
        
        // 更新显示
        document.getElementById('monthlyBudget').textContent = `¥${budget.toFixed(2)}`;
        document.getElementById('budgetUsed').textContent = `¥${usedBudget.toFixed(2)}`;
        
        const remainingElement = document.getElementById('budgetRemaining');
        remainingElement.textContent = `¥${remainingBudget.toFixed(2)}`;
        
        // 根据剩余预算设置颜色
        if (remainingBudget < 0) {
            remainingElement.style.color = '#E74C3C';
        } else if (remainingBudget < budget * 0.2) {
            remainingElement.style.color = '#F39C12';
        } else {
            remainingElement.style.color = '#70AD47';
        }
        
        // 更新进度条
        const progressBar = document.getElementById('budgetProgress');
        progressBar.style.width = `${Math.min(progress, 100)}%`;
        
        // 根据进度设置颜色
        if (progress > 90) {
            progressBar.style.background = 'linear-gradient(90deg, #E74C3C, #C0392B)';
        } else if (progress > 70) {
            progressBar.style.background = 'linear-gradient(90deg, #F39C12, #E67E22)';
        } else {
            progressBar.style.background = 'linear-gradient(90deg, #70AD47, #8BC34A)';
        }
    }


    // ===== 资产管理 =====
    loadAssets() {
        const data = localStorage.getItem('assetData');
        return data ? JSON.parse(data) : { 固定存款: 0, 备用金: 0, 外借款: 0 };
    }
    saveAssets(d) { localStorage.setItem('assetData', JSON.stringify(d)); }

    loadAssetRecords() {
        const data = localStorage.getItem('assetRecords');
        return data ? JSON.parse(data) : [];
    }
    saveAssetRecords(r) { localStorage.setItem('assetRecords', JSON.stringify(r)); }

    importAssets() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.assets) {
                        const existing = this.loadAssets();
                        for (const [k, v] of Object.entries(data.assets)) {
                            if (!existing[k]) existing[k] = v;
                        }
                        this.saveAssets(existing);
                    }
                    if (data.records && data.records.length > 0) {
                        const recs = this.loadAssetRecords();
                        this.saveAssetRecords(data.records.concat(recs));
                    }
                    this.renderAssets();
                    this.showToast('asset imported', 'success');
                } catch (err) { this.showToast('import failed', 'error'); }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    clearAssets() {
        if (confirm('确定清空所有资产数据？')) {
            localStorage.removeItem('assetData');
            localStorage.removeItem('assetRecords');
            this.renderAssets();
            this.showToast('asset cleared', 'success');
        }
    }



    showAssetModal(name, action) {
        this._assetName = name;
        this._assetAction = action;
        document.getElementById('assetModalTitle').textContent = action + ' - ' + name;
        document.getElementById('assetAmount').value = '';
        document.getElementById('assetNote').value = '';
        document.getElementById('assetModal').style.display = 'flex';
    }

    closeAssetModal() {
        document.getElementById('assetModal').style.display = 'none';
    }

    saveAsset() {
        const amt = parseFloat(document.getElementById('assetAmount').value);
        const note = document.getElementById('assetNote').value.trim();
        if (!amt || amt <= 0) { this.showToast('请输入金额', 'error'); return; }

        const assets = this.loadAssets();
        const isAdd = ['存入', '补充', '借出'].includes(this._assetAction);
        const change = isAdd ? amt : -amt;
        assets[this._assetName] = (assets[this._assetName] || 0) + change;
        this.saveAssets(assets);

        const records = this.loadAssetRecords();
        records.unshift({
            date: new Date().toISOString().slice(0, 10),
            name: this._assetName,
            action: this._assetAction,
            amount: amt,
            note: note,
            balance: assets[this._assetName]
        });
        this.saveAssetRecords(records);

        this.closeAssetModal();
        this.renderAssets();
        this.showToast('已' + this._assetAction + ' ¥' + amt.toFixed(2), 'success');
    }

    renderAssets() {
        const assets = this.loadAssets();
        document.getElementById('assetFixed').textContent = '¥' + (assets['固定存款'] || 0).toFixed(2);
        document.getElementById('assetReserve').textContent = '¥' + (assets['备用金'] || 0).toFixed(2);
        document.getElementById('assetLoan').textContent = '¥' + (assets['外借款'] || 0).toFixed(2);

        const records = this.loadAssetRecords();
        const container = document.getElementById('assetRecords');
        if (records.length === 0) {
            container.innerHTML = '<p class="empty-message">暂无记录</p>';
            return;
        }
        container.innerHTML = '<table class="record-table"><thead><tr><th>日期</th><th>资产</th><th>操作</th><th>金额</th><th>备注</th><th>余额</th></tr></thead><tbody>' +
            records.slice(0, 50).map(r => '<tr class="record-row"><td>' + r.date.slice(5) + '</td><td>' + r.name + '</td><td>' + r.action + '</td><td>' + r.amount.toFixed(2) + '</td><td>' + (r.note || '') + '</td><td>' + r.balance.toFixed(2) + '</td></tr>').join('') +
            '</tbody></table>';
    }


    // ===== 年度固定开销 =====
    loadAnnual() {
        const d = localStorage.getItem('annualExpenses');
        return d ? JSON.parse(d) : [];
    }
    saveAnnual(list) { localStorage.setItem('annualExpenses', JSON.stringify(list)); }

    showAnnualForm() {
        const mc = document.querySelector('#annualModal .modal-content');
        mc.innerHTML = '<div class="modal-header"><h2>新增年度开销</h2><button class="modal-close" onclick="app.closeAnnualForm()">&times;</button></div>' +
            '<div class="modal-body">' +
            '<div class="form-group"><label>项目名称</label><input type="text" id="annualName" placeholder="如：车险、物业费"></div>' +
            '<div class="form-group"><label>金额（元）</label><input type="number" id="annualAmount" step="0.01" min="0" placeholder="0.00"></div>' +
            '<div class="form-group"><label>支付来源</label><select id="annualSource"><option value="">请选择</option><option value="备用金">💰 备用金</option><option value="固定存款">💳 固定存款</option></select></div>' +
            '<div class="form-group"><button class="btn-submit" onclick="app.saveAnnual()">确认</button></div>' +
            '</div>';
        document.getElementById('annualModal').style.display = 'flex';
    }
    closeAnnualForm() { document.getElementById('annualModal').style.display = 'none'; }

    saveAnnual() {
        const name = document.getElementById('annualName').value.trim();
        const amount = parseFloat(document.getElementById('annualAmount').value);
        const source = document.getElementById('annualSource').value;
        if (!name || !amount || amount <= 0 || !source) { this.showToast('请填写完整', 'error'); return; }
        
        const assets = this.loadAssets();
        const cur = assets[source] || 0;
        if (cur < amount) { this.showToast(source + '余额不足(¥' + cur.toFixed(2) + ')', 'error'); return; }
        assets[source] = cur - amount;
        this.saveAssets(assets);
        
        const list = this.loadAnnual();
        list.push({ id: Date.now(), name, amount, source, date: new Date().toISOString().slice(0,10) });
        localStorage.setItem('annualExpenses', JSON.stringify(list));
        this.closeAnnualForm();
        this.renderAnnual(); this.renderAssets();
        this.showToast('已添加: ' + name + ' ¥' + amount.toFixed(2), 'success');
    }

    deleteAnnual(id) {
        const list = this.loadAnnual();
        const item = list.find(x => x.id === id);
        if (!item) return;
        if (confirm('删除并退回 ' + item.name + ' ¥' + item.amount.toFixed(2) + ' 到' + (item.source||'资产') + '？')) {
            // 退回资产
            if (item.source) {
                const assets = this.loadAssets();
                assets[item.source] = (assets[item.source] || 0) + item.amount;
                this.saveAssets(assets);
            }
            localStorage.setItem('annualExpenses', JSON.stringify(list.filter(x => x.id !== id)));
            this.renderAnnual(); this.renderAssets();
        }
    }

    deleteAnnual(id) {
        const list = this.loadAnnual();
        const item = list.find(x => x.id === id);
        if (item && confirm('删除 ' + item.name + '？')) {
            localStorage.setItem('annualExpenses', JSON.stringify(list.filter(x => x.id !== id)));
            this.renderAnnual();
        }
    }

    importAnnual() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = (e) => {
            if (!e.target.files[0]) return;
            const r = new FileReader();
            r.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    const list = this.loadAnnual().concat(data.map(x => ({ id: Date.now() + Math.random()*1e6, name: x.name, amount: x.amount, paid: x.paid || false })));
                    localStorage.setItem('annualExpenses', JSON.stringify(list));
                    this.renderAnnual();
                    this.showToast('imported ' + data.length, 'success');
                } catch (err) { this.showToast('import failed', 'error'); }
            };
            r.readAsText(e.target.files[0]);
        };
        input.click();
    }

    renderAnnual() {
        const list = this.loadAnnual();
        const container = document.getElementById('annualList');
        const summary = document.getElementById('annualSummary');
        if (list.length === 0) {
            container.innerHTML = '<p class="empty-message">暂无年度开销</p>';
            summary.style.display = 'none';
            return;
        }
        container.innerHTML = list.map(x => '<div class="annual-item">' +
            '<div class="annual-left"><div><span class="annual-name">' + x.name + '</span>' +
            '<span style="font-size:11px;color:#999;display:block;">' + (x.source||'') + ' ' + (x.date||'').slice(5) + '</span></div></div>' +
            '<div style="display:flex;align-items:center;gap:8px;"><span class="annual-amount">¥' + x.amount.toFixed(2) + '</span>' +
            '<button class="annual-del" onclick="event.stopPropagation();app.deleteAnnual(' + x.id + ')">×</button></div></div>').join('');
        const total = list.reduce((s,x) => s + x.amount, 0);
        document.getElementById('annualTotal').textContent = '¥' + total.toFixed(2);
        summary.style.display = 'block';
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast show';
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // 加载记录（本地）
    loadRecords() {
        const records = localStorage.getItem('accountingRecords');
        return records ? JSON.parse(records) : [];
    }

    // 加载预算（本地）
    loadBudgets() {
        const budgets = localStorage.getItem('monthlyBudgets');
        return budgets ? JSON.parse(budgets) : {};
    }

    // 保存数据（云端+本地）
    async persistData() {
        // 始终保存在本地作为备份
        this.saveRecordsToLocal();
        this.saveBudgetsToLocal();

        // 如果连接了云端，异步同步
        if (this.useCloud) {
            try {
                await this.syncToCloud();
            } catch (error) {
                console.error('❌ 云端同步失败（数据已保存在本地）：', error);
            }
        }
    }

    // 同步数据到云端
        async syncToCloud() {
        const BATCH_SIZE = 80;

        // 1. 清除云端旧数据
        const { data: old } = await window._supabase.from('records').select('id');
        if (old && old.length > 0) {
            const ids = old.map(r => r.id);
            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                await window._supabase.from('records').delete().in('id', ids.slice(i, i + BATCH_SIZE));
            }
        }

        // 2. 批量插入新数据
        if (this.records.length > 0) {
            for (let i = 0; i < this.records.length; i += BATCH_SIZE) {
                await window._supabase.from('records').insert(this.records.slice(i, i + BATCH_SIZE));
            }
        }

        // 3. 同步预算
        await window._supabase.from('budgets').delete().neq('month', '__none__');
        const entries = Object.entries(this.budgets).map(([m, a]) => ({ month: m, amount: a }));
        if (entries.length > 0) await window._supabase.from('budgets').insert(entries);
    }

    // 保存记录到本地
    saveRecordsToLocal() {
        localStorage.setItem('accountingRecords', JSON.stringify(this.records));
    }

    // 保存预算到本地
    saveBudgetsToLocal() {
        localStorage.setItem('monthlyBudgets', JSON.stringify(this.budgets));
    }

    // 导出数据为JSON
    exportToExcel() {
        const dataStr = JSON.stringify(this.records, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `记账数据_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
        
        this.showToast('📥 数据已导出为JSON文件', 'info');
    }

    // 从JSON文件导入数据
        importFromJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const raw = JSON.parse(event.target.result);
                    if (!Array.isArray(raw) || raw.length === 0) {
                        this.showToast('文件格式错误', 'error');
                        return;
                    }
                    const importedRecords = raw
                        .filter(r => r.date && r.type && r.category && r.amount != null)
                        .map((r, i) => ({
                            id: Date.now() * 1000 + i,
                            date: String(r.date).slice(0, 10),
                            type: r.type,
                            category: r.category,
                            amount: parseFloat(r.amount),
                            note: String(r.note || ''),
                            timestamp: new Date().toISOString()
                        }));
                    this.records = this.records.concat(importedRecords);
                    this.persistData();
                    this.renderTodayRecords();
                    this.updateStatistics();
                    this.updateBudgetDisplay();
                    this.showToast('导入成功 ' + importedRecords.length + '条', 'success');
                } catch (error) {
                    console.error('导入错误:', error);
                    this.showToast('导入失败: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }}

// 初始化应用
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new AccountingApp();
});

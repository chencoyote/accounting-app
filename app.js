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
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            }
        });

        // 更新内容显示
        const tabPanes = document.querySelectorAll('.tab-pane');
        tabPanes.forEach(pane => {
            pane.classList.remove('active');
            if (pane.id === tabId) {
                pane.classList.add('active');
            }
        });

        // 如果切换到月度明细标签，自动查询当前月
        if (tabId === 'tabMonthly') {
            const queryMonth = document.getElementById('queryMonth').value;
            if (queryMonth) {
                this.queryMonthlyDetail(queryMonth);
            }
        }
    }

    // 设置默认日期为今天
    setTodayDate() {
        const dateInput = document.getElementById('date');
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }

    // 绑定事件
    bindEvents() {
        // 类型选择按钮
        const typeButtons = document.querySelectorAll('.btn-type');
        typeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchType(e.target.dataset.type);
            });
        });

        // 表单提交
        const form = document.getElementById('recordForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRecord();
        });

        // 分类选择变化
        const categorySelect = document.getElementById('category');
        categorySelect.addEventListener('change', (e) => {
            // 可以在这里添加额外逻辑
        });
    }

    // 绑定查询事件
    bindQueryEvent() {
        const queryMonthInput = document.getElementById('queryMonth');
        if (queryMonthInput) {
            // 设置默认值为当前月
            const now = new Date();
            const currentMonth = now.toISOString().slice(0, 7);
            queryMonthInput.value = currentMonth;
            
            // 监听月份选择变化
            queryMonthInput.addEventListener('change', (e) => {
                this.queryMonthlyDetail(e.target.value);
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

    // 保存记录
    saveRecord() {
        const form = document.getElementById('recordForm');
        const formData = new FormData(form);
        
        const recordId = document.getElementById('recordId') ? document.getElementById('recordId').value : null;
        
        const record = {
            id: recordId ? parseInt(recordId) : Date.now(),
            date: formData.get('date'),
            type: formData.get('type'),
            category: formData.get('category'),
            amount: parseFloat(formData.get('amount')),
            note: formData.get('note'),
            timestamp: new Date().toISOString()
        };

        // 验证
        if (!record.date || !record.type || !record.category || !record.amount) {
            this.showToast('❌ 请填写完整信息', 'error');
            return;
        }

        if (recordId) {
            // 编辑模式：更新已有记录
            const index = this.records.findIndex(r => r.id === record.id);
            if (index !== -1) {
                this.records[index] = record;
            }
            this.showToast('✅ 记录修改成功！', 'success');
        } else {
            // 新增模式：添加新记录
            this.records.push(record);
            this.showToast('✅ 记录保存成功！', 'success');
        }

        // 保存数据
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
        
        // 重置表单（保留日期和类型）
        this.resetForm();
    }

    // 编辑记录
    editRecord(id) {
        const record = this.records.find(r => r.id === id);
        if (!record) {
            this.showToast('❌ 记录不存在', 'error');
            return;
        }

        // 填充表单
        document.getElementById('date').value = record.date;
        document.getElementById('type').value = record.type;
        this.switchType(record.type);
        document.getElementById('category').value = record.category;
        document.getElementById('amount').value = record.amount;
        document.getElementById('note').value = record.note || '';

        // 添加隐藏字段存储记录ID
        let recordIdInput = document.getElementById('recordId');
        if (!recordIdInput) {
            recordIdInput = document.createElement('input');
            recordIdInput.type = 'hidden';
            recordIdInput.id = 'recordId';
            document.getElementById('recordForm').appendChild(recordIdInput);
        }
        recordIdInput.value = id;

        // 修改提交按钮文本
        const submitBtn = document.querySelector('.btn-submit');
        submitBtn.textContent = '✅ 更新记录';
        submitBtn.style.background = 'linear-gradient(135deg, #F39C12, #F1C40F)';

        // 添加取消按钮
        let cancelBtn = document.getElementById('cancelEdit');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.id = 'cancelEdit';
            cancelBtn.className = 'btn-submit';
            cancelBtn.style.background = 'linear-gradient(135deg, #95A5A6, #7F8C8D)';
            cancelBtn.style.marginTop = '10px';
            cancelBtn.textContent = '❌ 取消编辑';
            cancelBtn.onclick = () => this.cancelEdit();
            document.getElementById('recordForm').appendChild(cancelBtn);
        }
        cancelBtn.style.display = 'block';

        // 滚动到表单位置
        document.getElementById('recordForm').scrollIntoView({ behavior: 'smooth' });
        
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
        document.getElementById('type').value = this.currentType;
        this.switchType(this.currentType);

        // 移除记录ID
        const recordIdInput = document.getElementById('recordId');
        if (recordIdInput) {
            recordIdInput.value = '';
        }

        // 恢复提交按钮
        const submitBtn = document.querySelector('.btn-submit');
        submitBtn.textContent = '✅ 保存记录';
        submitBtn.style.background = 'linear-gradient(135deg, #70AD47, #8BC34A)';

        // 隐藏取消按钮
        const cancelBtn = document.getElementById('cancelEdit');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
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
            container.innerHTML = todayRecords.map(record => this.createRecordHTML(record)).join('');
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

    // 创建记录HTML
    createRecordHTML(record) {
        const typeClass = record.type === '支出' ? 'expense' : 'income';
        const sign = record.type === '支出' ? '-' : '+';
        
        return `
            <div class="record-item" data-id="${record.id}">
                <div class="record-info">
                    <div class="record-category">${record.category}</div>
                    ${record.note ? `<div class="record-note">${record.note}</div>` : ''}
                </div>
                <div class="record-right">
                    <div class="record-amount ${typeClass}">${sign}¥${record.amount.toFixed(2)}</div>
                    <div class="record-actions">
                        <button class="btn-edit" onclick="app.editRecord(${record.id})" title="编辑">✏️</button>
                        <button class="btn-delete" onclick="app.deleteRecord(${record.id})" title="删除">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }

    // 更新统计信息
    updateStatistics() {
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const monthRecords = this.records.filter(r => r.date && r.date.startsWith(currentMonth));
        
        const monthExpense = monthRecords
            .filter(r => r.type === '支出')
            .reduce((sum, r) => sum + r.amount, 0);
        
        const monthIncome = monthRecords
            .filter(r => r.type === '收入')
            .reduce((sum, r) => sum + r.amount, 0);
        
        const balance = monthIncome - monthExpense;

        document.getElementById('monthExpense').textContent = `¥${monthExpense.toFixed(2)}`;
        document.getElementById('monthIncome').textContent = `¥${monthIncome.toFixed(2)}`;
        
        const balanceElement = document.getElementById('monthBalance');
        balanceElement.textContent = `¥${balance.toFixed(2)}`;
        balanceElement.className = `stat-value ${balance >= 0 ? 'income' : 'expense'}`;
    }

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

        // 显示明细列表
        container.innerHTML = monthRecords.map(record => this.createRecordHTML(record)).join('');
        
        // 计算并显示统计
        const monthExpense = monthRecords
            .filter(r => r.type === '支出')
            .reduce((sum, r) => sum + r.amount, 0);
        
        const monthIncome = monthRecords
            .filter(r => r.type === '收入')
            .reduce((sum, r) => sum + r.amount, 0);
        
        const balance = monthIncome - monthExpense;

        document.getElementById('detailExpense').textContent = `¥${monthExpense.toFixed(2)}`;
        document.getElementById('detailIncome').textContent = `¥${monthIncome.toFixed(2)}`;
        
        const balanceElement = document.getElementById('detailBalance');
        balanceElement.textContent = `¥${balance.toFixed(2)}`;
        balanceElement.className = `amount ${balance >= 0 ? 'income' : 'expense'}`;
        
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

    // 显示Toast提示
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
        // 导出所有记录到云端
        const { data: existingRecords } = await window._supabase
            .from('records')
            .select('id');
        
        const existingIds = new Set((existingRecords || []).map(r => r.id));
        
        // 删除云端多余的记录
        for (const id of existingIds) {
            if (!this.records.find(r => r.id === id)) {
                await window._supabase.from('records').delete().eq('id', id);
            }
        }

        // 插入或更新记录
        for (const record of this.records) {
            if (existingIds.has(record.id)) {
                await window._supabase.from('records').update(record).eq('id', record.id);
            } else {
                await window._supabase.from('records').insert(record);
            }
        }

        // 同步预算
        await window._supabase.from('budgets').delete().neq('month', '__none__');
        
        const budgetEntries = Object.entries(this.budgets).map(([month, amount]) => ({
            month,
            amount
        }));
        
        if (budgetEntries.length > 0) {
            await window._supabase.from('budgets').insert(budgetEntries);
        }
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

// Supabase 配置文件
const SUPABASE_CONFIG = {
    url: 'https://huhwnlployqbqwitdqkg.supabase.co',
    anonKey: 'sb_publishable_yie3ywIdNp4-tm-cmHpFsw_4sge-YZ9'
};

// 初始化 Supabase 客户端
window._supabase = null;

if (SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL') {
    window._supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log('✅ Supabase 已连接');
} else {
    console.log('⚠️ 未配置 Supabase，使用本地存储');
}

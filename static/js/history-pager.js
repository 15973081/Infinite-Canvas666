(function (global) {
    'use strict';
    class HistoryPager {
        constructor(type, limit = 30) {
            this.type = type;
            this.limit = limit;
            this.reset();
        }
        reset() {
            this.cursor = null;
            this.hasMore = true;
        }
        async next() {
            if (!this.hasMore) return [];
            const query = new URLSearchParams({ type: this.type, limit: String(this.limit) });
            if (this.cursor !== null) query.set('cursor', this.cursor);
            const response = await fetch('/api/history/page?' + query);
            if (!response.ok) throw new Error('历史记录加载失败');
            const data = await response.json();
            if (!Array.isArray(data.items)) throw new Error('历史记录响应格式错误');
            this.cursor = data.next_cursor;
            this.hasMore = data.next_cursor !== null;
            return data.items;
        }
    }
    global.HistoryPager = HistoryPager;
})(window);

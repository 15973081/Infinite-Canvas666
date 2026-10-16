/* Presentation of browser-local snapshots. Storage and restore guards belong to MemberCanvasEdit. */
(() => {
    'use strict';
    const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
    function timeLabel(value){
        const date=new Date(value),elapsed=Math.max(0,Date.now()-date.getTime());
        if(!Number.isFinite(date.getTime()))return '时间未知';
        if(elapsed<60000)return '刚刚';
        if(elapsed<3600000)return Math.floor(elapsed/60000)+'分钟前';
        if(elapsed<7200000)return '1小时前';
        return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
    }
    function create({valid,onClose}){
        const previous=document.activeElement,dialog=node('dialog',undefined,'member-canvas-history');
        dialog.setAttribute('aria-label','历史版本');dialog.setAttribute('aria-modal','false');
        const header=node('header'),title=node('h2','历史版本'),closeButton=node('button','×');
        closeButton.type='button';closeButton.setAttribute('aria-label','关闭历史版本');
        header.append(title,closeButton);
        const scroll=node('div',undefined,'member-history-scroll'),current=node('div','当前版本','member-history-current');
        const group=node('details',undefined,'member-history-group'),summary=node('summary','历史记录'),list=node('div',undefined,'member-history-list');
        group.open=true;group.append(summary,list);
        const feedback=node('p','正在读取本机历史…','member-history-feedback');feedback.setAttribute('role','status');
        const note=node('footer'),label=node('p','本机历史 · 仅当前浏览器'),help=node('details'),helpTitle=node('summary','保存与恢复说明');
        help.append(helpTitle,node('p','仅显示当前成员、空间和画布的自动草稿，未同步到云端，也不是完整的云端版本记录。开始编辑后可恢复相同服务器版本；版本不同可另存副本。恢复先保留当前未保存内容，不会立即提交到服务器或重新生成任务。'));
        note.append(label,help);scroll.append(current,group,feedback);dialog.append(header,scroll,note);
        let closed=false;
        function close(){if(closed)return;closed=true;dialog.close();dialog.remove();document.body.classList.remove('member-history-open');onClose();if(previous?.isConnected)previous.focus({preventScroll:true});}
        function count(){const total=list.children.length;summary.textContent=total+'个历史版本';feedback.textContent=total?'':'暂无本机历史记录';}
        closeButton.onclick=close;
        dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
        dialog.addEventListener('pointerdown',event=>event.stopPropagation());
        document.body.append(dialog);dialog.show();document.body.classList.add('member-history-open');closeButton.focus({preventScroll:true});
        return {dialog,close,get closed(){return closed;},
            focus:()=>closeButton.focus({preventScroll:true}),
            sync(){if(!valid())close();},
            failed(error){feedback.textContent='读取历史失败：'+(error.message||'请关闭后重试');},
            complete:count,
            addRow(row,origin){
                const item=node('details',undefined,'member-history-row'),heading=node('summary',timeLabel(row.saved_at));
                heading.title=new Date(row.saved_at).toLocaleString();
                const info=node('p',`基于版本 ${row.base_revision ?? '未知'} · ${origin}`,'member-history-meta');
                const stats=node('p',`${row.document?.nodes?.length||0} 个节点 · ${row.document?.connections?.length||0} 条连线`,'member-history-meta');
                const actions=node('div',undefined,'member-history-actions');item.append(heading,info,stats,actions);list.append(item);
                item.addEventListener('toggle',()=>{if(item.open)for(const other of list.children)if(other!==item)other.open=false;});
                return actions;
            },
            removeRow(line){line.parentElement.remove();count();}
        };
    }
    window.MemberCanvasHistory=Object.freeze({create});
})();

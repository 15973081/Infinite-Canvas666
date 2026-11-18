module.exports=function nativeReshoot({cache=false,duration=8}={}){
    const original={assetsUuid:'native-source',type:'VIDEO',webUrl:'/assets/reshoot-source.mp4',width:160,height:90,metaData:JSON.stringify({duration,name:'原视频.mp4'})};
    const data={label:'原生片段重拍',segmentReshoot:true};
    if(cache)data.reshootClipCache={reshootSourceAssetUuid:'native-source',reshootStartSec:'1.0',reshootEndSec:'6.0',clipAssetUuid:'native-clip',headFrameAssetUuid:'native-head',tailFrameAssetUuid:'native-tail'};
    const nodes=[{uuid:'native-video',type:'BASE_VIDEO',defaultAsset:original,metaData:JSON.stringify({position:{x:0,y:0}})},
        {uuid:'native-reshoot',type:'GENERATE_VIDEO',defaultAsset:original,prevNodeUuids:['native-video'],params:{model:'PIXDANCE_2_5',referModel:'videoEdit',aspectRatio:'adaptive',duration:'4',count:'1',prompt:'把头发改成红色',reshootSourceAssetUuid:'native-source',reshootStartSec:'1.0',reshootEndSec:'6.0',...(cache?{reshootClipAssetUuid:'native-clip',reshootHeadFrameAssetUuid:'native-head',reshootTailFrameAssetUuid:'native-tail'}:{})},metaData:JSON.stringify({position:{x:400,y:0},data}),generationTask:{taskUuid:'foreign-task',status:'RUNNING'}}];
    if(cache)for(const [id,type,url] of [['native-clip','VIDEO','/assets/native-clip.mp4'],['native-head','IMAGE','/test-image.svg?head'],['native-tail','IMAGE','/test-image.svg?tail']])nodes.push({uuid:id+'-node',type:type==='VIDEO'?'BASE_VIDEO':'BASE_IMAGE',defaultAsset:{assetsUuid:id,type,webUrl:url,metaData:JSON.stringify({duration:5})}});
    return {nodes};
};

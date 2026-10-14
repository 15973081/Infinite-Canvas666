/* Drive the actual native Kz option buttons; no hidden select or state writes. */
module.exports=async function chooseReshootModel(page,providerName,model){
    await page.getByRole('button',{name:'重拍模型',exact:true}).click();
    await page.locator('.pixmax-reshoot-model-options').getByText(providerName+' · '+model,{exact:true}).click();
};

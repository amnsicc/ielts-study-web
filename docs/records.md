# D2b记录公开边界（实施前固定）

openStudyRecords({directory, clock?, append?})：directory为绝对隔离目录；clock和append仅在系统边界注入时钟/写入故障。返回read()、apply(operation)、export()、close()。read/export为异步，apply为串行异步。

operation为{operationId,type,module,entryId? ,targetOperationId?,materialId?}。type取forget/undo/open；四模块为reading/listening/writing/speaking。undo绑定增加事件，并且只能撤销该对象最近未撤销的增加。operationId最长128位ASCII字母数字、冒号、点、短横线或下划线。同ID同内容幂等，同ID异内容拒绝。事件持久格式追加version=1、time（服务端ISO日期），其他字段严格校验。

read返回{revision,counts:{reading:{entryId:n},...},undoable:{reading:{entryId:operationId},...},history:{reading:{materialId:{opens,lastOpened}},...}}。无记录对象由调用者按0解释，读取失败不能冒充0。export返回{format:'ielts-study-records',version:1,events,view}，是导出副本，不承诺导入/恢复。

HTTP：GET /api/records读取；POST /api/records/operations应用；GET /api/records/export下载。服务通过startStudyServer({port,host,directory,store?})公开启动供HTTP夹具和CLI共用。API写入只接受同源Origin、application/json，严格验证当前catalog/materials身份；GET拒绝跨源Origin，所有API拒绝cross-site Fetch Metadata。记录目录不静态公开。

存储追加成功+fsync后才确认，预写失败可重试；写入一旦开始失败则锁定该Store，需关服务保全记录后重开，不猜测是否已写入。文件坏/未知版本/不完整尾行不截断或清零。目录内独占锁阻止第二写者，正常关闭释放锁；异常残锁不自动删，先核对进程/备份再人工处理。持久数据不进Git/ZIP。

阅读会话追加setRecords(view)与setCountFilter(null|{operator,threshold})；getView返回counts、countFilter。原filters结构保持grade/query兼容。次数按母词组独立命中后与关键词/P档交集，未知记录时不能启用次数筛选。重置不清setRecords载入的记录；换篇仅清countFilter。

前端设计沿用#F4F6F8底色、#FFFFFF纸面、#192C36正文、#536771次字、#176C63强调、#D8E1E5边界。中文系统无衬线、英文Georgia。原编号下放小次数标记，行控制内放+1/撤销，不新增列；次数筛选与现有工具行自然换行。文章历史用紧凑一行，记录状态与重试/刷新/导出放可见但轻量的位置。避免新侧栏和统计面板占据阅读区域。

布局：词表顶栏/筛选 → 编号及次数 | 英文 | 阅读义 | 显隐及记忆操作；下区文章工具/历史 → 正文。实际记录状态明确显示读取中、保存中、已保存、未保存可重试，绝不先加本地假数字。记录操作只更新词表，保留正文位置。原生modal、遮挡、搜索与分区保持。

自查：使用真实“没记住次数”命名，不作为P档/熟练度；0无数字、不可用显式提示。减少小窗固定工具高度，状态行允许横向换行、内容区仍可滚到；无装饰动效，长期记录与界面重置在文案中区分。

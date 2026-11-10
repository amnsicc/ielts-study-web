# D2b记录公开边界（实施前固定）

## F01实施前设计与边界

关闭编辑窗恢复可操作焦点：连接/可见/非disabled的原编辑入口优先，失败待办交给记录状态行重试；无原入口时搜索框后备。调用focus后核对真实activeElement，重试入口必要时仅在词表区域内滚动可见。不开新编辑、不清待办、不自动重试，不改事件、保存或Store/API。

沿用#F4F6F8/#FFFFFF/#192C36/#536771/#176C63/#D8E1E5与现有中文系统字体/Georgia，未增加视觉组件。流程：编辑窗口关闭 → 可用编辑入口；保存失败关闭 → 可用重试按钮；筛选移除原行 → 词表搜索。自查以实际焦点和可用键盘操作判断，不以截图或focus调用成功判断；不增加抢焦点动画/装饰或解除禁用。

## D2b-R1实施前约定

新增apply({operationId,type:'set_count',module,entryId,count,expectedLastOperationId})。count为非负安全整数，expectedLastOperationId为该对象当前最近次数事件ID，无历史为null。read追加entryVersions分模块/entryId返回此ID；同对象并发改变时拒绝覆盖，错误code=COUNT_CONFLICT，原操作不写入。不同对象/材料打开不冲突；相同ID重放先按幂等核对，再校验并发条件。

手动设置采用version=2事件，原forget/undo/open仍version=1；新程序同时读两版本，但v2仅允许set_count。export顶层有v2事件时version=2，否则保持1。旧程序遇到v2拒绝，禁止降级在新数据上写入。原v1事件不迁移、不重写。

设数成为新基准，清掉此前该对象的可撤销增加；以后+1及其撤销只相对新基准。0不显示；取消/未改数不写事件。弹窗只以编号识别对象，预填当前已保存数，保存失败保留输入、原操作重试；冲突需刷新当前数再确认，不自动覆盖或把冲突操作塞住其他任务。

设计沿用底色#F4F6F8、纸面#FFFFFF、正文#192C36、次字#536771、强调#176C63、边界#D8E1E5及原字体。紧凑原生dialog：编号、次数数字框、保存/取消、状态/重试。行末新增编辑入口，不添加新列/侧栏。ESC/取消回入口，保存中的窗口不因状态重绘丢输入。默认阈值0，比较仍不限；选篇/清筛选/重置恢复0，清关键词/页内返回保留值。

自查：编号用于避免绕过遮挡；只增加完成真实操作的按钮；保存失败和冲突都给下一步，不用静默重设。497×811也检查弹窗和行内控件，仍是桌面缩窗。

openStudyRecords({directory, clock?, append?})：directory为绝对隔离目录；clock和append仅在系统边界注入时钟/写入故障。返回read()、apply(operation)、export()、close()。read/export为异步，apply为串行异步。

operation为{operationId,type,module,entryId? ,targetOperationId?,materialId?}。type取forget/undo/open；四模块为reading/listening/writing/speaking。undo绑定增加事件，并且只能撤销该对象最近未撤销的增加。operationId最长128位ASCII字母数字、冒号、点、短横线或下划线。同ID同内容幂等，同ID异内容拒绝。事件持久格式追加version=1、time（服务端ISO日期），其他字段严格校验。

read返回{revision,counts:{reading:{entryId:n},...},undoable:{reading:{entryId:operationId},...},history:{reading:{materialId:{opens,lastOpened}},...}}。无记录对象由调用者按0解释，读取失败不能冒充0。export返回{format:'ielts-study-records',version:1,events,view}，是导出副本，不承诺导入/恢复。

HTTP：GET /api/records读取；POST /api/records/operations应用；GET /api/records/export下载。服务通过startStudyServer({port,host,directory,store?})公开启动供HTTP夹具和CLI共用。API写入只接受同源Origin、application/json，严格验证当前catalog/materials身份；GET拒绝跨源Origin，所有API拒绝cross-site Fetch Metadata。记录目录不静态公开。

存储追加成功+fsync后才确认，预写失败可重试；写入一旦开始失败则锁定该Store，需关服务保全记录后重开，不猜测是否已写入。文件坏/未知版本/不完整尾行不截断或清零。目录内独占锁阻止第二写者，正常关闭释放锁；异常残锁不自动删，先核对进程/备份再人工处理。持久数据不进Git/ZIP。

阅读会话追加setRecords(view)与setCountFilter(null|{operator,threshold})；getView返回counts、countFilter。原filters结构保持grade/query兼容。次数按母词组独立命中后与关键词/P档交集，未知记录时不能启用次数筛选。重置不清setRecords载入的记录；换篇仅清countFilter。

前端设计沿用#F4F6F8底色、#FFFFFF纸面、#192C36正文、#536771次字、#176C63强调、#D8E1E5边界。中文系统无衬线、英文Georgia。原编号下放小次数标记，行控制内放+1/撤销，不新增列；次数筛选与现有工具行自然换行。文章历史用紧凑一行，记录状态与重试/刷新/导出放可见但轻量的位置。避免新侧栏和统计面板占据阅读区域。

布局：词表顶栏/筛选 → 编号及次数 | 英文 | 阅读义 | 显隐及记忆操作；下区文章工具/历史 → 正文。实际记录状态明确显示读取中、保存中、已保存、未保存可重试，绝不先加本地假数字。记录操作只更新词表，保留正文位置。原生modal、遮挡、搜索与分区保持。

自查：使用真实“没记住次数”命名，不作为P档/熟练度；0无数字、不可用显式提示。减少小窗固定工具高度，状态行允许横向换行、内容区仍可滚到；无装饰动效，长期记录与界面重置在文案中区分。

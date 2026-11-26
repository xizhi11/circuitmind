(function(){
'use strict';
const guides={
 'workshop-light':{
  intro:'建议先完成选择器、寄存器和计数器实验。打开独立空白画布后，可放入固定接口，也可放入未连线的参考元件并逐条接线。镜面查表、反射和移动模块都能打开内部电路观察。',
  flow:['棋盘位图','镜面查表','异或反射','坐标寄存器','出界与接收锁存'],
  tech:'光束从坐标 (0, 0) 向东出发。每一拍查当前格的镜面，决定是否反射，然后更新坐标和方向。接收器、出界和 64 拍保护由电路判定，页面只提供镜面输入并绘制寄存器报告的轨迹。',
  ports:['IN16「mirror-mask」「mirror-flips」分别表示有无镜面和朝向。格号 i = 4×Y + X 对应位 i，从左上角起算。朝向 0 为斜镜，1 为反斜镜。','IN8「goal-row」给出右侧接收器的目标行（0～3）。方向 0、1、2、3 分别为东、南、西、北。','beam-x、beam-y、beam-dir 是 8 位探针。beam-done、beam-hit、beam-loop 是 1 位探针，分别显示结束、命中、超限。'],
  steps:['先放入固定接口。在「镜面查表」里，按 Y×4+X 算四位地址，用四层二选一选择器读取两张 16 位位图。','连接「镜面反射」。斜镜对方向做 XOR 3，反斜镜做 XOR 1。没有镜面时直接传递方向。先检查东向输入遇到两种镜面时分别变成北和南。','用加减器更新相应坐标，比较当前坐标和边缘。出界时保持坐标，只有从东边越过目标行才算命中。把结束标志反接到寄存器使能，让结果锁住。','接计数器和 63 比较器，验证第 64 拍仍未出界时停止。回到试玩，翻转镜面后用单步核对位置、方向和总拍数。'],
  check:'第一题初始镜面会把光向北送出棋盘。翻转第 1 行第 2 列和第 3 行第 2 列的镜面，最终应点亮右侧第 3 行的接收器。',
  challenge:'比较斜镜与反斜镜的方向真值表，再尝试把三题的光路逐拍画出来。'
 },
 'workshop-mines':{
  flow:['点击棋盘','RAM 命令','Symphony CPU','格子状态 / 结果'],
  tech:'页面只把格号写入命令地址并读取棋盘。布雷、统计邻雷数、空白扩展、输赢判断都由汇编执行。',
  ports:['ROM32 装扫雷程序，IN32「input」提供 16 位随机种子，RAM32「ram」保存棋盘。','0x1000–0x103F 是 64 格。每格高三位是雷、旗、已开，低四位是邻雷数。','0x1100 接命令（1–64 揭格，65–128 插旗），0x1101 返回 0 进行中、1 踩雷、2 胜利。0x1102 是打开的安全格数。'],
  steps:['在空白画布放入接口端口，参考电路图搭建 32 位取指、寄存器读写、ALU 和访存。先用两条指令验证 RAM 写入和读回。','在「汇编与屏幕」装载扫雷程序。先让命令轮询和一格揭开跑通，再加布雷、邻雷计数和空格队列。把队列放在 0x1200 起。','回到试玩，用同一种子测试首格保护、插旗、踩雷和打开最后一个安全格。观察 0x1100 归零才表示该次输入处理完毕。'],
  check:'首次揭格不会踩雷。插旗可取消，打开 56 个安全格后 0x1101 变成 2。',
  challenge:'改变雷数，同时调整胜利阈值。用固定种子比较调整前后的棋盘。'
 },
 'workshop-robot':{
  flow:['墙壁传感器','Overture IN','CPU 分支','OUT → 机器人'],
  tech:'地图只模拟墙和机器人。程序用掩码读传感器，决定转向或前进。参考程序采用右手贴墙策略。',
  ports:['IN8「input」低三位依次表示前、左、右有墙。','OUT8「output」命令 0 左转、1 前进、2 右转。OUT「strobe」为 1 时，地图执行一次命令。','ROM16「rom」装 Overture 指令。PC 用指令字地址，每次顺序取指加 1。'],
  steps:['搭 Overture 的 PC、六个寄存器、ALU 和译码。先让 MOV R1, IN 把输入写入寄存器，再接输出有效线。','先写一个只做转向的程序。单步看到 OUT = 2 时，机器人应向右转一次。随后用 AND 和条件跳转判断右墙与前墙。','把循环装入 ROM。按「单步」对照 IN 掩码与 OUT 动作，再分别运行三张地图。'],
  check:'地图 1 开始时 IN 为 0b110。正确程序到达出口，持续盲目前进的程序会撞墙。',
  challenge:'写一个左手贴墙版本，在三张地图比较动作数。'
 },
 'workshop-lander':{
  flow:['方向键 / 推力','RAM 命令','32 位 CPU 更新状态','显存和仪表'],
  tech:'高度和下落速度使用 1/16 像素定点数。CPU 每帧加重力、处理推力和燃料，判定接地速度，再擦掉旧像素并写新像素。',
  ports:['RAM32「ram」的 0x1000 是命令。0x10 请求一帧，低三位分别表示推力、左移、右移。','0x1200 是 32 位高度，0x1204 是有符号速度，0x1208–0x120A 是燃料、横坐标、结果。结果 1 表示成功，2 表示坠毁。','64×48 的 RGB332 显存从 0x5000 起，地址为 0x5000 + y×64 + x。'],
  steps:['搭好 Symphony 的取指、回写和 RAM 接口，用 STORE_8 在 0x5000 写一个亮点。','在汇编中加入 poll、gravity、motion 和 touchdown。逐帧增加下落速度，点推力时减速度并扣一单位燃料。','用移位计算屏幕坐标，测试不踩推力会坠毁，适时踩推力能在横坐标 24～40 着陆。'],
  check:'悬空时重力改变下落速度，推力每次消耗一单位燃料。着陆速度须不超过 12/16 像素每帧。',
  challenge:'把参考程序中减速度的 5 改成 4，比较需要提前多少帧点火。'
 },
 'workshop-link':{
  flow:['左屏像素','发送 CPU','虚拟链路','接收 CPU → 右屏'],
  tech:'画布上有两个可独立编辑的 Symphony CPU，分别执行发送和接收程序。虚拟链路只锁存数据，并能翻转下一帧的一位。验包、写入图像和重发都由 CPU 完成。',
  ports:['发送侧用 rom / ram / input / output / strobe，接收侧同名端口加 rx- 前缀。两台机各自取指和保存内存。','帧位 0–7 为像素，位 8–10 为行号，位 15 为有效标志，位 16–23 为行号 XOR 像素。','接收端 OUT 1 确认、OUT 2 要求重传。发送端从 IN 读应答；两端 0x1100 起分别是八行像素。'],
  steps:['搭出两份 CPU。分别接通 ROM、RAM 和 IN / OUT / strobe。选「发送端」和「接收端」分别汇编。','先做单行端到端，把行号打包，接收端解包后把像素写入自己的 RAM。核对左右格子。','补上 XOR 校验和等待应答的循环，再连发八行。先点「翻转下一帧的一位」，再点「发送」。'],
  check:'正常传输左右屏相同。注入一位错误后，重发计数增加 1，最终两屏仍相同。',
  challenge:'把同一帧的两位翻转，分析简单 XOR 校验在哪些情况下会漏检。'
 },
 'workshop-cube':{
  flow:['帧请求','CPU 投影顶点','DDA 画线','RGB332 显存'],
  tech:'汇编从 16 组正弦和余弦常量中取角度，算出八个投影顶点，再用 DDA 为十二条边逐点写显存。设备在开始新帧时清空帧缓冲。',
  ports:['0x1000 写 1 请求一帧，CPU 写回 0 表示完成。0x1200 保存下一个角度索引。','0x1300 起是有符号常量表，0x1400 起是八对屏幕坐标。0x5000 起是 64×48 的 RGB332 显存。','ROM32「rom」和 RAM32「ram」负责指令与显存，PC 按 4 字节推进。'],
  steps:['先接出 Symphony 的 ROM 和 RAM 读写。用 STORE_8 验证显存地址与屏幕坐标一一对应。','把两个端点送入 line 子程序。坐标放大 32 倍，用 ASR 取整，在一条边上写出 33 个采样点。','扩展到八个顶点和十二条边。每帧更新角度，切回试玩暂停后按「单步指令」，观察 R1、R2 与显存变化。'],
  check:'推进两帧时角度索引递增，显存像素位置变化；暂停后可用单步看像素逐个出现。',
  challenge:'把背面线改成另一种 RGB332 颜色，或者只画其中四条边。'
 },
 'workshop-rhythm':{
  flow:['8×8 灯阵','CPU 修改节拍 RAM','列计数 / OUT 掩码','音频外设'],
  tech:'浏览器提供可编辑的灯阵、节拍脉冲和音频输出。八步计数、行扫描以及当前音轨掩码都由 CPU 处理，音频只根据实际 OUT 信号发声。',
  ports:['命令地址 0x1000。1–64 翻转指定格，65 推进一步。0x1200–0x123F 保存八条音轨，0x1240 是当前拍。','OUT 低八位是发声轨的掩码，strobe 为 1 时音频外设读取。','准备自己的处理器时，可在输入接口前另接分频计数器，每隔若干拍发一次节拍。'],
  steps:['先搭一只三位循环计数器，验证从 7 回到 0。接入工作台的 RAM 和 OUT。','让 CPU 按 RAM 的列编号扫描八行。用移位和 OR 合并出八位音轨掩码。','在灯阵点亮第 1 与第 5 拍，按播放启用声音，然后暂停并单步观察当前拍和掩码。'],
  check:'一个格子打开后，在它所在列扫描到达时，相应的 OUT 位为 1。未点亮的格子保持静音。',
  challenge:'把速度减半，再编出八步切分节奏。'
 },
 'workshop-shell':{
  flow:['输入命令','CPU 逐字节匹配','虚拟磁盘 PLOAD','终端 RAM'],
  tech:'这是迷你命令解释器。ls、cat 和 run 由汇编解析。程序从虚拟盘装入 RAM，再由 CPU 上的小解释器执行磁盘里的字节码。',
  ports:['0x1000 是命令长度，ASCII 命令放在 0x1100 起。终端字符写入 0x5400 起的 RAM。','虚拟磁盘对应 RAM32「storage」，偏移 0、128、256 分别是目录、文本、应用。PLOAD 从该设备取 32 位字。','应用加载到 0x1500。字节码 1 给计数器加一、2 打印一位数字、0 结束。'],
  steps:['搭好 Symphony 的取指、主内存和第二存储区。单步检查 PLOAD 与 LOAD_32 分别读取哪块 RAM。','在 ROM 中做命令匹配，先让 ls 输出目录。然后用 cat 循环读取文件，遇到 0 字节结束。','最后加应用加载和字节码解释器。输入 run count.bin，检查 0x1500 和终端输出；再输入一个未知命令验证错误分支。'],
  check:'ls 列出 readme.txt 和 count.bin，cat 显示磁盘中的正文，run 打印 123。',
  challenge:'修改字节码解释器，让它支持一条减一指令，然后修改虚拟磁盘样例。'
 }
};
const originals=Game.levels.filter(l=>l.workshop);
for(const work of originals){
 const guide=guides[work.id];
 if(!guide)continue;
 Game.levels.splice(Game.levels.findIndex(l=>l.id==='sandbox'),0,{...work,id:work.id+'-build',workshopBuildOf:work.id,title:work.title+' · 我的搭建'});
}
function markdown(work){
 const g=guides[work.id];
 return [
  '# '+work.title,'## 技术说明',g.flow.join(' → '),g.tech,'## 接口',g.ports.map(item=>'- '+item).join('\n'),
  '## 从空白搭建',g.intro||buildIntro,
  g.steps.map((step,i)=>(i+1)+'. '+step).join('\n'),'## 检验结果',g.check,'## 练习',g.challenge,
  '## 参考接线表','\x60\x60\x60text\n'+wiring(work)+'\n\x60\x60\x60',
  ...(work.program?['## '+(work.receiver?'发送端参考汇编':'参考汇编'),'\x60\x60\x60asm\n'+work.program+'\n\x60\x60\x60']:[]),
  ...(work.receiver?['## 接收端参考汇编','\x60\x60\x60asm\n'+work.receiver+'\n\x60\x60\x60']:[])
 ].join('\n\n')+'\n';
}
const buildIntro='建议先完成逻辑门、寄存器、CPU 数据通路和汇编主线。打开独立空白画布后，可以放入固定接口，自选数据通路。也可以放入未连线的参考元件，按接线表逐条连接。最后在汇编面板加载程序并回到试玩。';
function wiring(work){
 const circuit=work.build(),nodes=new Map(circuit.nodes.map(n=>[n.id,n]));
 return [
  '括号内是画布显示名。引脚序号从 0 开始，用来区分同名引脚。',
  ...circuit.wires.map(w=>{
   const from=nodes.get(w.from),to=nodes.get(w.to),out=w.output??0;
   const output=Circuit.definition(from).outputs[out].name,input=Circuit.definition(to).inputs[w.pin].name;
   return from.id+'（'+from.label+'）.'+output+'['+out+'] → '+to.id+'（'+to.label+'）.'+input+'['+w.pin+']';
  })
 ].join('\n');
}
Game.workshopGuides={guides,originals,markdown,wiring,buildIntro};
})();

export function checkAnswers(definition,rawInputs){
  const rows={},issues=[],uses=new Map();let correct=0,submitted=0;
  const totalExpected=definition.targets.reduce((n,t)=>n+t.correctNumbers.length,0);
  for(const target of definition.targets){
    const raw=rawInputs[target.id]||'',tokens=raw.split(/[,，、\s]+/).filter(Boolean),numbers=[],duplicates=[];
    for(const token of tokens){
      if(token==='?'||token==='？')continue;
      const n=Number(token);
      if(!/^\d+$/.test(token)||!Number.isSafeInteger(n)||n<1){issues.push({targetId:target.id,token});continue;}
      if(numbers.includes(n)){if(!duplicates.includes(n))duplicates.push(n);}else numbers.push(n);
    }
    const right=numbers.filter(n=>target.correctNumbers.includes(n));
    rows[target.id]={raw,numbers,correct:right,wrong:numbers.filter(n=>!target.correctNumbers.includes(n)),missing:target.correctNumbers.filter(n=>!right.includes(n)),blank:!raw.trim(),question:tokens.some(t=>t==='?'||t==='？'),duplicates,outOfRange:numbers.filter(n=>n>totalExpected)};
    for(const n of numbers)uses.set(n,[...(uses.get(n)||[]),target.id]);
    correct+=right.length;submitted+=numbers.length;
  }
  if(issues.length)throw Object.assign(new Error('请修改无效序号后核对；可用空格、逗号或顿号分隔，问号需单独填写。'),{code:'INVALID_ANSWER',issues});
  if(!submitted)throw Object.assign(new Error('请先填写至少一个有效序号；空白和问号不计准确率。'),{code:'EMPTY_ANSWER'});
  return {correct,submitted,percentage:correct/submitted*100,wrong:submitted-correct,totalExpected,unmatchedExpected:totalExpected-correct,rows,sharedNumbers:[...uses].filter(([,ids])=>ids.length>1).map(([number,targetIds])=>({number,targetIds}))};
}

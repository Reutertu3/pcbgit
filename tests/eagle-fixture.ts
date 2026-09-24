/** Small, made-up Eagle schematics for the converter tests. */

export interface FixtureOptions {
	version?: string;
	/** Value attribute of R1; undefined leaves it to Eagle's default. */
	r1Value?: string;
	sheets?: number;
	/** Extra XML inside <eagle>, before <drawing>. */
	prologue?: string;
	r1X?: string;
}

const library = `
<library name="demo">
<symbols>
<symbol name="R">
<wire x1="-2.54" y1="-0.889" x2="2.54" y2="-0.889" width="0.254" layer="94"/>
<wire x1="2.54" y1="0.889" x2="-2.54" y2="0.889" width="0.254" layer="94"/>
<wire x1="-2.54" y1="0.889" x2="-2.54" y2="-0.889" width="0.254" layer="94" curve="45"/>
<text x="-3.81" y="1.4986" size="1.778" layer="95">&gt;NAME</text>
<text x="-3.81" y="-3.302" size="1.778" layer="96">&gt;VALUE</text>
<text x="0" y="-5" size="1.27" layer="96">&gt;TOLERANCE</text>
<pin name="1" x="-5.08" y="0" visible="off" length="short" direction="pas" swaplevel="1"/>
<pin name="2" x="5.08" y="0" visible="off" length="short" direction="pas" swaplevel="1" rot="R180"/>
</symbol>
<symbol name="GND">
<wire x1="-1.905" y1="0" x2="1.905" y2="0" width="0.254" layer="94"/>
<text x="-2.54" y="-2.54" size="1.778" layer="96">&gt;VALUE</text>
<pin name="GND" x="0" y="2.54" visible="off" length="short" direction="sup" rot="R270"/>
</symbol>
<symbol name="FRAME">
<frame x1="0" y1="0" x2="100" y2="80" columns="4" rows="3" layer="94"/>
<text x="70" y="5" size="2.54" layer="94">&gt;SHEET</text>
<text x="70" y="10" size="2.54" layer="94">&gt;PROJECT</text>
</symbol>
</symbols>
<devicesets>
<deviceset name="R-EU_" prefix="R" uservalue="yes">
<description>&lt;b&gt;Resistor&lt;/b&gt; demo</description>
<gates><gate name="G$1" symbol="R" x="0" y="0"/></gates>
<devices><device name="R0603" package="R0603">
<connects><connect gate="G$1" pin="1" pad="1"/><connect gate="G$1" pin="2" pad="2"/></connects>
<technologies><technology name=""><attribute name="TOLERANCE" value="1%"/></technology></technologies>
</device></devices>
</deviceset>
<deviceset name="GND" prefix="GND">
<gates><gate name="1" symbol="GND" x="0" y="0"/></gates>
<devices><device name=""><technologies><technology name=""/></technologies></device></devices>
</deviceset>
<deviceset name="FRAME" prefix="FRAME">
<gates><gate name="G$1" symbol="FRAME" x="0" y="0"/></gates>
<devices><device name=""><technologies><technology name=""/></technologies></device></devices>
</deviceset>
</devicesets>
</library>`;

function sheet(index: number) {
	return `
<sheet>
<plain><text x="10" y="70" size="2.54" layer="97">Sheet text ${index}</text></plain>
<instances>
<instance part="FRAME${index}" gate="G$1" x="0" y="0"/>
<instance part="R${index}" gate="G$1" x="30" y="40" rot="R90"/>
<instance part="GND${index}" gate="1" x="30" y="25"/>
</instances>
<busses/>
<nets>
<net name="SIG" class="0"><segment>
<wire x1="30" y1="45.08" x2="30" y2="55" width="0.1524" layer="91"/>
<label x="31" y="55" size="1.778" layer="95"/>
<pinref part="R${index}" gate="G$1" pin="2"/>
</segment></net>
<net name="GND" class="0"><segment>
<wire x1="30" y1="34.92" x2="30" y2="27.54" width="0.1524" layer="91"/>
<junction x="30" y="30"/>
<pinref part="R${index}" gate="G$1" pin="1"/>
</segment></net>
</nets>
</sheet>`;
}

export function eagleSchematic(options: FixtureOptions = {}) {
	const sheets = options.sheets ?? 1;
	const parts: string[] = [];
	for (let i = 1; i <= sheets; i++) {
		const value = i === 1 && options.r1Value !== undefined ? ` value="${options.r1Value}"` : '';
		parts.push(
			`<part name="R${i}" library="demo" deviceset="R-EU_" device="R0603"${value}/>`,
			`<part name="GND${i}" library="demo" deviceset="GND" device=""/>`,
			`<part name="FRAME${i}" library="demo" deviceset="FRAME" device=""/>`
		);
	}
	const sheetXml = Array.from({ length: sheets }, (_, i) => sheet(i + 1)).join('');
	const r1x = options.r1X;
	return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE eagle SYSTEM "eagle.dtd">
<eagle version="${options.version ?? '9.1.3'}">
${options.prologue ?? ''}
<drawing>
<settings><setting alwaysvectorfont="no"/></settings>
<layers><layer number="91" name="Nets" color="2" fill="1" visible="yes" active="yes"/></layers>
<schematic>
<libraries>${library}</libraries>
<attributes><attribute name="PROJECT" value="Demo board"/></attributes>
<parts>${parts.join('\n')}</parts>
<sheets>${r1x ? sheetXml.replace('x="30" y="40" rot="R90"', `x="${r1x}" y="40" rot="R90"`) : sheetXml}</sheets>
</schematic>
</drawing>
</eagle>
`;
}

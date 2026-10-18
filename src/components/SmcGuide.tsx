import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Sparkles, HelpCircle } from 'lucide-react';

export const SmcGuide: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="lux-panel rounded-3xl p-4 sm:p-5 border border-white/[0.08]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left text-sm font-bold text-slate-200 hover:text-cyan-300 transition-all group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 group-hover:scale-105 transition-transform">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-white text-sm sm:text-base group-hover:text-cyan-300 transition-colors">
              คู่มือหลักการ Smart Money Concepts (SMC) ฉบับเข้าใจง่าย
            </span>
            <p className="text-[11px] text-slate-400 font-medium">
              คลิกเพื่อดูวิธีที่กองทุนใหญ่ (สถาบัน) ผลักดันราคาและจุดที่ควรสังเกต
            </p>
          </div>
        </div>
        <div className="shrink-0 ml-2 p-1.5 rounded-lg bg-slate-800/60 border border-white/[0.08] text-slate-400 group-hover:text-cyan-300 transition-colors">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100 mt-4 pt-4 border-t border-white/[0.08]' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs leading-relaxed">
            {/* BOS */}
            <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-400/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-emerald-300 font-extrabold mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span>BOS (Break of Structure)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  แท่งเทียนทะลุไฮเดิม (ในขาขึ้น) หรือทะลุโลว์เดิม (ในขาลง) ยืนยันว่า <strong>เทรนด์เดิมยังคงแข็งแรงต่อเนื่อง</strong>
                </p>
              </div>
              <span className="mt-2 text-[10px] text-emerald-400/80 font-mono font-bold">สัญญาณ: เทรนด์ไปต่อ</span>
            </div>

            {/* CHoCH */}
            <div className="p-3.5 rounded-2xl bg-violet-950/20 border border-violet-500/30 hover:border-violet-400/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-violet-300 font-extrabold mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                  <span>CHoCH (Change of Character)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  แท่งเทียนทะลุโครงสร้างสวนทางกับเทรนด์เดิม เป็นสัญญาณเตือนแรกว่า <strong>สถาบันกำลังเริ่มกลับทิศทางแนวโน้ม</strong>
                </p>
              </div>
              <span className="mt-2 text-[10px] text-violet-400/80 font-mono font-bold">สัญญาณ: ระวังกลับตัว</span>
            </div>

            {/* Order Blocks */}
            <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 hover:border-cyan-400/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-cyan-300 font-extrabold mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                  <span>Order Blocks (OB)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  แท่งเทียนสุดท้ายก่อนสถาบันเข้าซื้อหรือเทขายก้อนใหญ่ เป็นแนวรับ (Demand) หรือแนวต้าน (Supply) ที่ <strong>แข็งแกร่งที่สุด</strong>
                </p>
              </div>
              <span className="mt-2 text-[10px] text-cyan-400/80 font-mono font-bold">สัญญาณ: จุดซุ่มรอของสถาบัน</span>
            </div>

            {/* FVG & Premium/Discount */}
            <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30 hover:border-amber-400/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-amber-300 font-extrabold mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span>FVG & Premium/Discount</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  <strong>FVG:</strong> ช่องว่างกระโดดราคาที่รอการกลับมาเติมเต็ม<br />
                  <strong>Discount:</strong> ราคา &lt; 50% เหมาะกับการเข้าซื้อ<br />
                  <strong>Premium:</strong> ราคา &gt; 50% เหมาะกับการขายทำกำไร
                </p>
              </div>
              <span className="mt-2 text-[10px] text-amber-400/80 font-mono font-bold">หลักการ: ซื้อถูก ขายแพง</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

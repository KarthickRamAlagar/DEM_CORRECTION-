import { Bento, BentoCard, plainText } from "./Ui";

// The Assumptions tab: unit costs and how to read the numbers, as glass cards in a bento grid. No status column.
const LABEL = { household_size: "Household size", relief_cash_per_household: "Relief cash per household", crop_per_ha: "Crop input subsidy per hectare", house_fully_damaged: "House fully damaged" };
const GROUP = { IND: "India", NPL: "Nepal" };
const money = (n, cur) => (cur === "NPR" ? `NPR ${Number(n).toLocaleString("en-IN")}` : `₹${Number(n).toLocaleString("en-IN")}`);

function valueOf(key, v, cur) {
  const isMoney = /cash|^crop|^house_fully/.test(key);
  const f = (x) => (isMoney ? money(x, cur) : String(x));
  if (v.value != null) return f(v.value);
  const a = [v.low, v.high].filter((x) => x != null);
  return a.length === 2 && a[0] === a[1] ? f(a[0]) : a.map(f).join(" to ");
}
// where a value comes from: the source, or the first part of the note when no source is given
function sourceOf(v) {
  if (v.source || v.what) return v.source ?? v.what;
  const t = String(v.status ?? "").split(/;|\. Data/)[0].replace(/^(partly )?verified\s*/i, "").trim();
  return t.length > 12 && !/^\(.*\)$/.test(t) && !/^read from page/i.test(t) ? t : "";
}
const TOPICS = [
  ["Flood data", /Copernicus|radar|Two bounds|rainfall/i],
  ["What exposure means", /Exposure|corrected DEM|Population|Cropland is/i],
  ["Money and coverage", /Recovery need|Housing|unit costs|Districts with|decision-support/i],
];

export default function AboutBento({ meta }) {
  const a = meta.assumptions ?? {};
  const groups = TOPICS.map(([title, re]) => [title, (meta.limitations ?? []).filter((l) => re.test(l))]);
  const used = new Set(groups.flatMap(([, l]) => l));
  const rest = (meta.limitations ?? []).filter((l) => !used.has(l));
  if (rest.length) groups.push(["More notes", rest]);
  const country = (k) => {
    const g = a[k]; if (!g) return null;
    const items = Object.entries(g).filter(([, v]) => v && typeof v === "object");
    return (
      <BentoCard key={k} title={`${GROUP[k]} unit costs`} className="md:col-span-3 lg:col-span-4">
        <dl className="mt-2 space-y-3">
          {items.map(([key, v]) => (
            <div key={key}>
              <dt className="text-[13px] text-ink-300">{LABEL[key] ?? key.replaceAll("_", " ")}</dt>
              <dd className="text-[15px] font-semibold tabular-nums text-white">{valueOf(key, v, g.currency)}</dd>
              {sourceOf(v) && <dd className="mt-0.5 text-[13px] leading-snug text-ink-300">{sourceOf(v)}</dd>}
            </div>
          ))}
        </dl>
      </BentoCard>
    );
  };
  return (
    <div className="mt-6">
      <Bento>
        {a.inr_to_npr && (
          <BentoCard title="Exchange rate" value={`1 INR = ${a.inr_to_npr.value} NPR`} sub={a.inr_to_npr.source} className="md:col-span-6 lg:col-span-4" />
        )}
        <BentoCard title="How the need is worked out" className="md:col-span-6 lg:col-span-8">
          <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-100">
            <li><span className="font-medium text-white">Households</span> = people under water divided by household size.</li>
            <li><span className="font-medium text-white">Need</span> = households times relief cash, plus cropland hectares under water times the crop input subsidy (India only).</li>
            <li><span className="font-medium text-white">Housing</span> is a separate ceiling and is never added to the need.</li>
          </ul>
        </BentoCard>
        {country("IND")}
        {country("NPL")}
        <BentoCard title="Estimate for planning" className="md:col-span-6 lg:col-span-4">
          <p className="mt-2 text-[13px] leading-relaxed text-ink-100">Every figure is a decision-support estimate from observed flood exposure. It is not a forecast and it does not authorise any release of funds.</p>
        </BentoCard>
        {groups.filter(([, l]) => l.length).map(([title, list]) => (
          <BentoCard key={title} title={title} className="md:col-span-3 lg:col-span-4">
            <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink-100">
              {list.map((l) => <li key={l} className="flex gap-2"><span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-signal-teal" /><span>{plainText(l)}</span></li>)}
            </ul>
          </BentoCard>
        ))}
        {meta.region && <BentoCard className="md:col-span-6 lg:col-span-12"><p className="text-[13px] leading-relaxed text-ink-300">{plainText(meta.region)}</p></BentoCard>}
      </Bento>
    </div>
  );
}

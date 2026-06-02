/**
 * Native TypeScript NTES client — ported from ntes-client (Python).
 * @see https://github.com/x64vbhv/ntes-client/blob/main/ntes/client.py
 */
import { buildNtesPayload, decodeNtesPayload } from './crypto';
import { NTESError } from './exceptions';

const BASE_URL = 'https://enquiry.indianrail.gov.in/crisns/AppServAnd';
const WARMUP_URL = 'https://enquiry.indianrail.gov.in/mntes/';

export type NtesClientOptions = {
  timeoutMs?: number;
  retries?: number;
};

export type NtesTrainInstance = {
  trainStatus?: number;
  trainPosition?: string;
  startDate?: string;
};

export type NtesTrainInfo = {
  TrainNo?: string;
  TrainName?: string;
  Src?: string;
  Dstn?: string;
  vInstanceList?: NtesTrainInstance[];
};

export type NtesLiveStatus = {
  TrainNo?: string;
  TrainName?: string;
  TN?: string;
  TNM?: string;
  CurrentStation?: string;
  CurrentStationName?: string;
  LSTN?: string;
  LSTNN?: string;
  NPSTN?: string;
  NPSTNN?: string;
  LastUpdate?: string;
  LEVNT?: string;
  LUPDT?: string;
  LUPDFULL?: string;
  DelayDep?: string;
  DelayArr?: string;
  DDEP?: string;
  DARR?: string;
  LDEL?: number | string;
  LTIME?: string;
  Platform?: string;
  PF?: string;
  NextStationCode?: string;
  NextStationName?: string;
  StartDate?: string;
  STD?: string;
  SRC?: string;
  SRCN?: string;
  DSTN?: string;
  DSTNN?: string;
  STNS?: import('./types').NtesRunStationRow[];
  AlertMsg?: string;
  alertMsg?: string;
};

export type NtesSchedule = {
  TrainNumber?: string;
  TrainName?: string;
  Source?: string;
  SourceName?: string;
  Destination?: string;
  DestinationName?: string;
  TravelTime?: string;
  stations?: import('./types').NtesScheduleStationRow[];
  startDate?: string;
  AlertMsg?: string;
};

function extractError(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const r = data as Record<string, unknown>;
  const msg = r.AlertMsg ?? r.alertMsg ?? r.AlertMsgHindi ?? r.alertMsgHindi;
  return typeof msg === 'string' && msg.trim() ? msg : undefined;
}

/** Minimal cookie jar — NTES often returns empty body without a warmed session. */
class NtesSession {
  private cookies = new Map<string, string>();
  private warmed = false;

  store(response: Response) {
    const setCookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];

    if (setCookies.length === 0) {
      const raw = response.headers.get('set-cookie');
      if (raw) setCookies.push(raw);
    }

    for (const cookie of setCookies) {
      const pair = cookie.split(';')[0]?.trim();
      const eq = pair?.indexOf('=');
      if (eq && eq > 0) {
        this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    }
  }

  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async warm(timeoutMs: number) {
    if (this.warmed) return;
    const res = await fetch(WARMUP_URL, {
      headers: { 'User-Agent': NTES_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    this.store(res);
    await res.arrayBuffer().catch(() => undefined);
    this.warmed = true;
  }
}

const NTES_USER_AGENT = 'Dalvik/2.1.0 (Linux; Android 11)';

export class NtesClient {
  private timeoutMs: number;
  private retries: number;
  private session = new NtesSession();

  constructor(opts: NtesClientOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 12_000;
    this.retries = opts.retries ?? 2;
  }

  private async post(payload: string): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        await this.session.warm(this.timeoutMs);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          charset: 'utf-8',
          'User-Agent': NTES_USER_AGENT,
          Referer: WARMUP_URL,
        };
        const cookie = this.session.header();
        if (cookie) headers.Cookie = cookie;

        const res = await fetch(BASE_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonIn: buildNtesPayload(payload) }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        this.session.store(res);

        const text = await res.text();
        if (!text.trim()) throw new NTESError('empty response');

        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          throw new NTESError('invalid json response');
        }

        const envelope = data as Record<string, unknown>;
        const decoded =
          typeof envelope.jsonIn === 'string' ? decodeNtesPayload(envelope.jsonIn) : data;

        const errorMsg = extractError(decoded);
        if (errorMsg) throw new NTESError(errorMsg);

        return decoded;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.retries) {
          await Bun.sleep(600 * (attempt + 1));
        }
      }
    }

    throw new NTESError(`request failed: ${lastError?.message ?? 'unknown error'}`);
  }

  trainInfo(trainNo: string): Promise<NtesTrainInfo> {
    return this.post(
      `service=TrainRunningMob&subService=GetTrainInstance&trainNo=${trainNo}`
    ) as Promise<NtesTrainInfo>;
  }

  liveStatus(trainNo: string, startDate: string): Promise<NtesLiveStatus> {
    return this.post(
      `service=TrainRunningMob&subService=ShowFullRunJson&trainNo=${trainNo}&startDate=${startDate}`
    ) as Promise<NtesLiveStatus>;
  }

  schedule(trainNo: string, startDate = ''): Promise<NtesSchedule> {
    return this.post(
      `service=TrainRunningMob&subService=GetTrainSchedule&trainNo=${trainNo}&startDate=${startDate}`
    ) as Promise<NtesSchedule>;
  }
}

/** NTES date format: DD-MMM-YYYY (e.g. 02-May-2026) */
export function formatNtesDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

/** Pick the best journey start date from train_info instances. */
export function pickStartDate(info: NtesTrainInfo): string {
  const instances = info.vInstanceList ?? [];
  const running = instances.find((i) => i.trainStatus != null && i.trainStatus !== 0);
  if (running?.startDate) return running.startDate;
  if (instances[0]?.startDate) return instances[0].startDate;
  return formatNtesDate(new Date());
}

import {uiScale} from '../web/desktop-scale';
import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';
import * as PAirplane from 'phosphor-react-native/src/icons/Airplane';
import * as PAlarm from 'phosphor-react-native/src/icons/Alarm';
import * as PArrowClockwise from 'phosphor-react-native/src/icons/ArrowClockwise';
import * as PArrowCounterClockwise from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import * as PArrowRight from 'phosphor-react-native/src/icons/ArrowRight';
import * as PArrowUUpLeft from 'phosphor-react-native/src/icons/ArrowUUpLeft';
import * as PArrowsClockwise from 'phosphor-react-native/src/icons/ArrowsClockwise';
import * as PArrowsDownUp from 'phosphor-react-native/src/icons/ArrowsDownUp';
import * as PBank from 'phosphor-react-native/src/icons/Bank';
import * as PBarbell from 'phosphor-react-native/src/icons/Barbell';
import * as PBell from 'phosphor-react-native/src/icons/Bell';
import * as PBookOpen from 'phosphor-react-native/src/icons/BookOpen';
import * as PBriefcase from 'phosphor-react-native/src/icons/Briefcase';
import * as PBus from 'phosphor-react-native/src/icons/Bus';
import * as PCalendarBlank from 'phosphor-react-native/src/icons/CalendarBlank';
import * as PCalendarPlus from 'phosphor-react-native/src/icons/CalendarPlus';
import * as PCamera from 'phosphor-react-native/src/icons/Camera';
import * as PCar from 'phosphor-react-native/src/icons/Car';
import * as PCaretLeft from 'phosphor-react-native/src/icons/CaretLeft';
import * as PCaretRight from 'phosphor-react-native/src/icons/CaretRight';
import * as PChartBar from 'phosphor-react-native/src/icons/ChartBar';
import * as PChartPie from 'phosphor-react-native/src/icons/ChartPie';
import * as PChatCircle from 'phosphor-react-native/src/icons/ChatCircle';
import * as PCheck from 'phosphor-react-native/src/icons/Check';
import * as PCheckCircle from 'phosphor-react-native/src/icons/CheckCircle';
import * as PCircle from 'phosphor-react-native/src/icons/Circle';
import * as PClockCounterClockwise from 'phosphor-react-native/src/icons/ClockCounterClockwise';
import * as PCoffee from 'phosphor-react-native/src/icons/Coffee';
import * as PCoins from 'phosphor-react-native/src/icons/Coins';
import * as PConfetti from 'phosphor-react-native/src/icons/Confetti';
import * as PCopy from 'phosphor-react-native/src/icons/Copy';
import * as PCreditCard from 'phosphor-react-native/src/icons/CreditCard';
import * as PDotsThree from 'phosphor-react-native/src/icons/DotsThree';
import * as PEnvelopeSimple from 'phosphor-react-native/src/icons/EnvelopeSimple';
import * as PEye from 'phosphor-react-native/src/icons/Eye';
import * as PEyeSlash from 'phosphor-react-native/src/icons/EyeSlash';
import * as PFilmSlate from 'phosphor-react-native/src/icons/FilmSlate';
import * as PForkKnife from 'phosphor-react-native/src/icons/ForkKnife';
import * as PFunnelSimple from 'phosphor-react-native/src/icons/FunnelSimple';
import * as PGasPump from 'phosphor-react-native/src/icons/GasPump';
import * as PGearSix from 'phosphor-react-native/src/icons/GearSix';
import * as PGift from 'phosphor-react-native/src/icons/Gift';
import * as PGraduationCap from 'phosphor-react-native/src/icons/GraduationCap';
import * as PHeart from 'phosphor-react-native/src/icons/Heart';
import * as PHeartbeat from 'phosphor-react-native/src/icons/Heartbeat';
import * as PHourglass from 'phosphor-react-native/src/icons/Hourglass';
import * as PHouse from 'phosphor-react-native/src/icons/House';
import * as PHouseLine from 'phosphor-react-native/src/icons/HouseLine';
import * as PImage from 'phosphor-react-native/src/icons/Image';
import * as PInfo from 'phosphor-react-native/src/icons/Info';
import * as PLightbulb from 'phosphor-react-native/src/icons/Lightbulb';
import * as PLightning from 'phosphor-react-native/src/icons/Lightning';
import * as PLink from 'phosphor-react-native/src/icons/Link';
import * as PListBullets from 'phosphor-react-native/src/icons/ListBullets';
import * as PListChecks from 'phosphor-react-native/src/icons/ListChecks';
import * as PLock from 'phosphor-react-native/src/icons/Lock';
import * as PMagnifyingGlass from 'phosphor-react-native/src/icons/MagnifyingGlass';
import * as PMapPin from 'phosphor-react-native/src/icons/MapPin';
import * as PMegaphone from 'phosphor-react-native/src/icons/Megaphone';
import * as PMicrophone from 'phosphor-react-native/src/icons/Microphone';
import * as PMonitor from 'phosphor-react-native/src/icons/Monitor';
import * as PMusicNotes from 'phosphor-react-native/src/icons/MusicNotes';
import * as PNote from 'phosphor-react-native/src/icons/Note';
import * as PNotebook from 'phosphor-react-native/src/icons/Notebook';
import * as PPackage from 'phosphor-react-native/src/icons/Package';
import * as PPaperPlaneRight from 'phosphor-react-native/src/icons/PaperPlaneRight';
import * as PPaperclip from 'phosphor-react-native/src/icons/Paperclip';
import * as PPause from 'phosphor-react-native/src/icons/Pause';
import * as PPawPrint from 'phosphor-react-native/src/icons/PawPrint';
import * as PPencilSimple from 'phosphor-react-native/src/icons/PencilSimple';
import * as PPhone from 'phosphor-react-native/src/icons/Phone';
import * as PPiggyBank from 'phosphor-react-native/src/icons/PiggyBank';
import * as PPill from 'phosphor-react-native/src/icons/Pill';
import * as PPlay from 'phosphor-react-native/src/icons/Play';
import * as PPlus from 'phosphor-react-native/src/icons/Plus';
import * as PPushPin from 'phosphor-react-native/src/icons/PushPin';
import * as PReceipt from 'phosphor-react-native/src/icons/Receipt';
import * as PRepeat from 'phosphor-react-native/src/icons/Repeat';
import * as PRobot from 'phosphor-react-native/src/icons/Robot';
import * as PShieldCheck from 'phosphor-react-native/src/icons/ShieldCheck';
import * as PShoppingCart from 'phosphor-react-native/src/icons/ShoppingCart';
import * as PSidebarSimple from 'phosphor-react-native/src/icons/SidebarSimple';
import * as PSignOut from 'phosphor-react-native/src/icons/SignOut';
import * as PSparkle from 'phosphor-react-native/src/icons/Sparkle';
import * as PSpeakerHigh from 'phosphor-react-native/src/icons/SpeakerHigh';
import * as PSquaresFour from 'phosphor-react-native/src/icons/SquaresFour';
import * as PStar from 'phosphor-react-native/src/icons/Star';
import * as PStop from 'phosphor-react-native/src/icons/Stop';
import * as PStorefront from 'phosphor-react-native/src/icons/Storefront';
import * as PTShirt from 'phosphor-react-native/src/icons/TShirt';
import * as PTag from 'phosphor-react-native/src/icons/Tag';
import * as PTelevision from 'phosphor-react-native/src/icons/Television';
import * as PTicket from 'phosphor-react-native/src/icons/Ticket';
import * as PTrash from 'phosphor-react-native/src/icons/Trash';
import * as PTray from 'phosphor-react-native/src/icons/Tray';
import * as PTrendDown from 'phosphor-react-native/src/icons/TrendDown';
import * as PTrendUp from 'phosphor-react-native/src/icons/TrendUp';
import * as PTruck from 'phosphor-react-native/src/icons/Truck';
import * as PUser from 'phosphor-react-native/src/icons/User';
import * as PUsers from 'phosphor-react-native/src/icons/Users';
import * as PWallet from 'phosphor-react-native/src/icons/Wallet';
import * as PWarning from 'phosphor-react-native/src/icons/Warning';
import * as PWrench from 'phosphor-react-native/src/icons/Wrench';
import * as PX from 'phosphor-react-native/src/icons/X';
import * as PFolder_ from 'phosphor-react-native/src/icons/Folder';
import * as PFolderPlus_ from 'phosphor-react-native/src/icons/FolderPlus';
import * as PFile_ from 'phosphor-react-native/src/icons/File';
import * as PFilePdf_ from 'phosphor-react-native/src/icons/FilePdf';
import * as PFileDoc_ from 'phosphor-react-native/src/icons/FileDoc';
import * as PFileXls_ from 'phosphor-react-native/src/icons/FileXls';
import * as PFilePpt_ from 'phosphor-react-native/src/icons/FilePpt';
import * as PFileAudio_ from 'phosphor-react-native/src/icons/FileAudio';
import * as PFileVideo_ from 'phosphor-react-native/src/icons/FileVideo';
import * as PFileImage_ from 'phosphor-react-native/src/icons/FileImage';
import * as PFileZip_ from 'phosphor-react-native/src/icons/FileZip';
import * as PFileText_ from 'phosphor-react-native/src/icons/FileText';
import * as PUploadSimple_ from 'phosphor-react-native/src/icons/UploadSimple';
import * as PDownloadSimple_ from 'phosphor-react-native/src/icons/DownloadSimple';
import * as PHardDrives_ from 'phosphor-react-native/src/icons/HardDrives';
import * as PPencilSimple_ from 'phosphor-react-native/src/icons/PencilSimple';
import * as PArrowsOutCardinal_ from 'phosphor-react-native/src/icons/ArrowsOutCardinal';
import * as PListBullets_ from 'phosphor-react-native/src/icons/ListBullets';
import * as PArrowsDownUp_ from 'phosphor-react-native/src/icons/ArrowsDownUp';
import * as PArrowSquareOut_ from 'phosphor-react-native/src/icons/ArrowSquareOut';
import * as PClock_ from 'phosphor-react-native/src/icons/Clock';
import * as PArrowCCW_ from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import * as PCloud_ from 'phosphor-react-native/src/icons/Cloud';
import * as PCheckSquare_ from 'phosphor-react-native/src/icons/CheckSquare';
import * as PZoomIn_ from 'phosphor-react-native/src/icons/MagnifyingGlassPlus';
import * as PZoomOut_ from 'phosphor-react-native/src/icons/MagnifyingGlassMinus';
import * as PSquaresFour_ from 'phosphor-react-native/src/icons/SquaresFour';

/** 0.3.259 (rodada premium, fase 1): icones de um conjunto profissional (Phosphor, licenca MIT), no mesmo grid e no
 * mesmo traco. Dois estados: contorno (regular) e preenchido quando `active` (ex.: aba atual do menu), como nos apps
 * premium. Os nomes antigos continuam valendo; os novos substituem os emojis que faziam papel de icone. */
const ICONS = {
 capsule: PPill.PillIcon,
 sofia: PSparkle.SparkleIcon,
 guardado: PPiggyBank.PiggyBankIcon,
 filter: PFunnelSimple.FunnelSimpleIcon,
 box: PPackage.PackageIcon,
 checklist: PListChecks.ListChecksIcon,
 cart: PShoppingCart.ShoppingCartIcon,
 cycle: PArrowsClockwise.ArrowsClockwiseIcon,
 mail: PEnvelopeSimple.EnvelopeSimpleIcon,
 tag: PTag.TagIcon,
 more: PDotsThree.DotsThreeIcon,
 camera: PCamera.CameraIcon,
 clip: PPaperclip.PaperclipIcon,
 settings: PGearSix.GearSixIcon,
 undo: PArrowCounterClockwise.ArrowCounterClockwiseIcon,
 redo: PArrowClockwise.ArrowClockwiseIcon,
/* 07/11/2026: Sofia Drive */
 folder: PFolder_.FolderIcon,
 folderPlus: PFolderPlus_.FolderPlusIcon,
 file: PFile_.FileIcon,
 filePdf: PFilePdf_.FilePdfIcon,
 fileDoc: PFileDoc_.FileDocIcon,
 fileXls: PFileXls_.FileXlsIcon,
 filePpt: PFilePpt_.FilePptIcon,
 fileAudio: PFileAudio_.FileAudioIcon,
 fileVideo: PFileVideo_.FileVideoIcon,
 fileImage: PFileImage_.FileImageIcon,
 fileZip: PFileZip_.FileZipIcon,
 fileText: PFileText_.FileTextIcon,
 upload: PUploadSimple_.UploadSimpleIcon,
 download: PDownloadSimple_.DownloadSimpleIcon,
 drive: PHardDrives_.HardDrivesIcon,
 rename: PPencilSimple_.PencilSimpleIcon,
 moveTo: PArrowsOutCardinal_.ArrowsOutCardinalIcon,
 listView: PListBullets_.ListBulletsIcon,
 sort: PArrowsDownUp_.ArrowsDownUpIcon,
 external: PArrowSquareOut_.ArrowSquareOutIcon,
 clock: PClock_.ClockIcon,
 restore: PArrowCCW_.ArrowCounterClockwiseIcon,
 cloud: PCloud_.CloudIcon,
 checkSquare: PCheckSquare_.CheckSquareIcon,
 zoomIn: PZoomIn_.MagnifyingGlassPlusIcon,
 zoomOut: PZoomOut_.MagnifyingGlassMinusIcon,
 gridView: PSquaresFour_.SquaresFourIcon,
 image: PImage.ImageIcon,
 copy: PCopy.CopyIcon,
 home: PHouse.HouseIcon,
 chat: PChatCircle.ChatCircleIcon,
 calendar: PCalendarBlank.CalendarBlankIcon,
 bell: PBell.BellIcon,
 user: PUser.UserIcon,
 mic: PMicrophone.MicrophoneIcon,
 send: PPaperPlaneRight.PaperPlaneRightIcon,
 play: PPlay.PlayIcon,
 pause: PPause.PauseIcon,
 stop: PStop.StopIcon,
 plus: PPlus.PlusIcon,
 close: PX.XIcon,
 back: PCaretLeft.CaretLeftIcon,
 history: PClockCounterClockwise.ClockCounterClockwiseIcon,
 trash: PTrash.TrashIcon,
 eye: PEye.EyeIcon,
 eyeOff: PEyeSlash.EyeSlashIcon,
 check: PCheck.CheckIcon,
 refresh: PArrowClockwise.ArrowClockwiseIcon,
 logout: PSignOut.SignOutIcon,
 volume: PSpeakerHigh.SpeakerHighIcon,
 chevron: PCaretRight.CaretRightIcon,
 shield: PShieldCheck.ShieldCheckIcon,
 grid: PSquaresFour.SquaresFourIcon,
 book: PBookOpen.BookOpenIcon,
 list: PListBullets.ListBulletsIcon,
 edit: PPencilSimple.PencilSimpleIcon,
 monitor: PMonitor.MonitorIcon,
 wallet: PWallet.WalletIcon,
 search: PMagnifyingGlass.MagnifyingGlassIcon,
 sidebar: PSidebarSimple.SidebarSimpleIcon,
 move: PArrowsDownUp.ArrowsDownUpIcon,
 backlog: PTray.TrayIcon,
 toAgenda: PCalendarPlus.CalendarPlusIcon,
 refund: PArrowUUpLeft.ArrowUUpLeftIcon,
 repeat: PRepeat.RepeatIcon,
 sparkle: PSparkle.SparkleIcon,
 warning: PWarning.WarningIcon,
 info: PInfo.InfoIcon,
 receipt: PReceipt.ReceiptIcon,
 piggy: PPiggyBank.PiggyBankIcon,
 note: PNote.NoteIcon,
 checkCircle: PCheckCircle.CheckCircleIcon,
 pin: PPushPin.PushPinIcon,
 link: PLink.LinkIcon,
 star: PStar.StarIcon,
 heart: PHeart.HeartIcon,
 lightning: PLightning.LightningIcon,
 lock: PLock.LockIcon,
 phone: PPhone.PhoneIcon,
 users: PUsers.UsersIcon,
 lightbulb: PLightbulb.LightbulbIcon,
 alarm: PAlarm.AlarmIcon,
 mapPin: PMapPin.MapPinIcon,
 card: PCreditCard.CreditCardIcon,
 bank: PBank.BankIcon,
 coins: PCoins.CoinsIcon,
 trendUp: PTrendUp.TrendUpIcon,
 trendDown: PTrendDown.TrendDownIcon,
 chartPie: PChartPie.ChartPieIcon,
 chartBar: PChartBar.ChartBarIcon,
 robot: PRobot.RobotIcon,
 megaphone: PMegaphone.MegaphoneIcon,
 truck: PTruck.TruckIcon,
 gift: PGift.GiftIcon,
 film: PFilmSlate.FilmSlateIcon,
 music: PMusicNotes.MusicNotesIcon,
 forkKnife: PForkKnife.ForkKnifeIcon,
 car: PCar.CarIcon,
 graduation: PGraduationCap.GraduationCapIcon,
 briefcase: PBriefcase.BriefcaseIcon,
 barbell: PBarbell.BarbellIcon,
 heartbeat: PHeartbeat.HeartbeatIcon,
 house2: PHouseLine.HouseLineIcon,
 storefront: PStorefront.StorefrontIcon,
 ticket: PTicket.TicketIcon,
 airplane: PAirplane.AirplaneIcon,
 coffee: PCoffee.CoffeeIcon,
 tshirt: PTShirt.TShirtIcon,
 tv: PTelevision.TelevisionIcon,
 paw: PPawPrint.PawPrintIcon,
 wrench: PWrench.WrenchIcon,
 gas: PGasPump.GasPumpIcon,
 bus: PBus.BusIcon,
 confetti: PConfetti.ConfettiIcon,
 hourglass: PHourglass.HourglassIcon,
 notebook: PNotebook.NotebookIcon,
 arrowRight: PArrowRight.ArrowRightIcon,
 circle: PCircle.CircleIcon,
} as const;
export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
/** 0.3.262 (fase 4 — icones proprios): desenhados no mesmo grid (24) e traco (1,6) do conjunto. "sofia" (a marca: um
 * quadro com a centelha da Sofia) e "capsule" (capsula na diagonal, metade preenchida). Contorno e preenchido. */
function SofiaGlyph({size, color, fill}: {size: number; color: string; fill: boolean}) {
  const spark = 'M12 6.6c.5 2.6 2.2 4.3 4.8 4.8-2.6.5-4.3 2.2-4.8 4.8-.5-2.6-2.2-4.3-4.8-4.8 2.6-.5 4.3-2.2 4.8-4.8z';
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {fill ? <Rect x="3" y="3" width="18" height="18" rx="6" fill={color} /> : <Rect x="3.8" y="3.8" width="16.4" height="16.4" rx="5.6" stroke={color} strokeWidth={1.6} />}
    <Path d={spark} fill={fill ? '#FFFFFF' : color} />
  </Svg>;
}
function CapsuleGlyph({size, color, fill}: {size: number; color: string; fill: boolean}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8.2 19.6a4.6 4.6 0 0 1-3.8-7.2l7.4-7.4a4.6 4.6 0 0 1 6.5 6.5l-7.4 7.4a4.6 4.6 0 0 1-2.7 0.7z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" fill={fill ? color : 'none'} />
    <Path d="M8.2 19.6a4.6 4.6 0 0 1-3.8-7.2l3.7-3.7 6.5 6.5-3.7 3.7a4.6 4.6 0 0 1-2.7 0.7z" fill={color} opacity={fill ? 1 : 0.28} />
    <Path d="M8.1 8.7l6.5 6.5" stroke={fill ? '#FFFFFF' : color} strokeWidth={1.6} strokeLinecap="round" />
  </Svg>;
}
/** "guardado": o cofrinho da Sofia - um pote com tampa e uma moeda entrando (reserva que vai enchendo). */
function GuardadoGlyph({size, color, fill}: {size: number; color: string; fill: boolean}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="8.5" width="14" height="12" rx="4" stroke={color} strokeWidth={1.6} fill={fill ? color : 'none'} />
    <Path d="M7.5 8.5V7a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 16.5 7v1.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    <Path d="M5 15.5h14" stroke={fill ? '#FFFFFF' : color} strokeWidth={1.6} opacity={fill ? 0.9 : 0.35} />
    <Rect x="10" y="2" width="4" height="4" rx="2" fill={color} />
  </Svg>;
}
const CUSTOM: Record<string, (p: {size: number; color: string; fill: boolean}) => React.ReactElement> = {sofia: SofiaGlyph, capsule: CapsuleGlyph, guardado: GuardadoGlyph};
export function Icon({ name, size: base = 22, color = '#7258E8', active = false, weight }: { name: IconName; size?: number; color?: string; active?: boolean; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }) {
  const size = Math.round(base * uiScale()); // 0.3.278: icones crescem junto com o site em telas grandes (1 no celular)
  const Own = CUSTOM[name];
  if (Own) return <Own size={size} color={color} fill={active || weight === 'fill'} />;
  const Glyph = ICONS[name] || ICONS.circle;
  return <Glyph size={size} color={color} weight={weight || (active ? 'fill' : 'regular')} />;
}

/** 0.3.259: emojis que faziam papel de icone viram o icone equivalente do conjunto (o que nao estiver aqui segue como texto). */
const EMOJI_GLYPH: Record<string, IconName> = {'🏪': 'storefront', '💰': 'coins', '📌': 'pin', '🏆': 'star', '📉': 'trendDown', '📈': 'trendUp', '🎯': 'star', '👍': 'checkCircle', '〰️': 'arrowRight', '⏳': 'hourglass', '🔎': 'search', '🔍': 'search', '✅': 'checkCircle', '📦': 'box', '🔔': 'bell', '⏰': 'alarm', '📎': 'clip', '🧾': 'receipt', '💳': 'card', '⚠️': 'warning', '📅': 'calendar', '💊': 'capsule', '🔁': 'repeat', '📝': 'note', '💡': 'lightbulb', '✨': 'sparkle'};
export function glyphForEmoji(e: string): IconName | null { return EMOJI_GLYPH[String(e || '').trim()] || null; }
export function EmojiIcon({e, size = 18, color = '#7258E8', fallback}: {e: string; size?: number; color?: string; fallback?: React.ReactNode}) {
  const g = glyphForEmoji(e);
  return g ? <Icon name={g} size={size} color={color} weight="duotone" /> : <>{fallback ?? null}</>;
}

import {
  Mountain, Crown, CalendarHeart, Footprints, TrendingUp, Snowflake, Shield, Umbrella, Sprout, PiggyBank,
  Landmark, Trophy, Hourglass, Banknote, Repeat, Rocket, Anchor, ChartPie, ShoppingCart, Crosshair, Waves,
  Zap, Coins, HandCoins, CircleDollarSign, Receipt, CalendarCheck, Infinity as Infini, Percent, Leaf, HeartPulse,
  FileCheck, Handshake, ListChecks, BadgeCheck, Scissors, Radar, Undo2, ClipboardCheck, BookOpen, Target,
  NotebookPen, Feather, Telescope, Archive, LockKeyhole, Stethoscope, Ghost, Clover, Scale, PartyPopper, Gem,
  Medal,
} from "lucide-react";

/**
 * Icône de chaque badge, par nom. Le catalogue (lib/badges.js) reste un module
 * pur, sans React : il ne connaît que le nom.
 */
const ICONES = {
  Mountain, Crown, CalendarHeart, Footprints, TrendingUp, Snowflake, Shield, Umbrella, Sprout, PiggyBank,
  Landmark, Trophy, Hourglass, Banknote, Repeat, Rocket, Anchor, ChartPie, ShoppingCart, Crosshair, Waves,
  Zap, Coins, HandCoins, CircleDollarSign, Receipt, CalendarCheck, Infinity: Infini, Percent, Leaf, HeartPulse,
  FileCheck, Handshake, ListChecks, BadgeCheck, Scissors, Radar, Undo2, ClipboardCheck, BookOpen, Target,
  NotebookPen, Feather, Telescope, Archive, LockKeyhole, Stethoscope, Ghost, Clover, Scale, PartyPopper, Gem,
};

export const iconeDe = (nom) => ICONES[nom] || Medal;

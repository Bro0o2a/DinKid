export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at?: string | null;
  birthday?: string | null;
};

export type Family = {
  id: string;
  name: string;
  created_by: string;
  photo_url?: string | null;
};

export type Member = {
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  profiles: Profile;
};

export type Message = {
  id: number;
  family_id: string;
  user_id: string;
  body: string;
  image_path?: string | null;
  audio_path?: string | null;
  reply_to?: number | null;
  poll?: { question: string; options: string[] } | null;
  created_at: string;
};

export type Reaction = { message_id: number; user_id: string; emoji: string };
export type Vote = { message_id: number; user_id: string; choice: number };
export type Read = { user_id: string; last_read_id: number; read_at: string };

export type FamilyEvent = {
  id: string;
  family_id: string;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
  remind_minutes?: number | null;
  created_by: string;
};

export type ListItem = {
  id: string;
  family_id: string;
  title: string;
  quantity: string | null;
  done: boolean;
  claimed_by: string | null;
  created_by: string;
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at?: string | null;
};

export type Family = {
  id: string;
  name: string;
  created_by: string;
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
  created_at: string;
};

export type FamilyEvent = {
  id: string;
  family_id: string;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
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

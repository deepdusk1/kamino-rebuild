alter table communities add column if not exists modules text not null
  default '["chats","wiki","files","events","rank","members"]';

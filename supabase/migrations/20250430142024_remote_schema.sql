

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."categories" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."chart_highlights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chart_id" "uuid" NOT NULL,
    "highlight" "text" NOT NULL,
    "context" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chart_highlights" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."charts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "config" "jsonb" NOT NULL,
    "export_config" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."charts" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."file_tags" (
    "file_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."file_tags" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "filename" "text" NOT NULL,
    "path" "text" NOT NULL,
    "source_id" "uuid",
    "category_id" "uuid",
    "uploaded_by" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."files" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."metric_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_id" "uuid" NOT NULL,
    "region_id" "uuid",
    "date" "date" NOT NULL,
    "value" numeric NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."metric_data" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."metric_data_tags" (
    "metric_data_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."metric_data_tags" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "unit" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."metrics" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_data_id" "uuid",
    "note" "text" NOT NULL,
    "visible_start_date" "date",
    "visible_end_date" "date",
    "region_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notes" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."regions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."regions" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sources" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "supabase_admin";


ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_highlights"
    ADD CONSTRAINT "chart_highlights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."charts"
    ADD CONSTRAINT "charts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_tags"
    ADD CONSTRAINT "file_tags_pkey" PRIMARY KEY ("file_id", "tag_id");



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metric_data"
    ADD CONSTRAINT "metric_data_metric_id_region_id_date_key" UNIQUE ("metric_id", "region_id", "date");



ALTER TABLE ONLY "public"."metric_data"
    ADD CONSTRAINT "metric_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metric_data_tags"
    ADD CONSTRAINT "metric_data_tags_pkey" PRIMARY KEY ("metric_data_id", "tag_id");



ALTER TABLE ONLY "public"."metrics"
    ADD CONSTRAINT "metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."regions"
    ADD CONSTRAINT "regions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."regions"
    ADD CONSTRAINT "regions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



CREATE INDEX "metric_data_metric_id_date_idx" ON "public"."metric_data" USING "btree" ("metric_id", "date");



CREATE INDEX "metric_data_region_id_idx" ON "public"."metric_data" USING "btree" ("region_id");



ALTER TABLE ONLY "public"."chart_highlights"
    ADD CONSTRAINT "chart_highlights_chart_id_fkey" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_tags"
    ADD CONSTRAINT "file_tags_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_tags"
    ADD CONSTRAINT "file_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."metric_data"
    ADD CONSTRAINT "metric_data_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metric_data"
    ADD CONSTRAINT "metric_data_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."metric_data_tags"
    ADD CONSTRAINT "metric_data_tags_metric_data_id_fkey" FOREIGN KEY ("metric_data_id") REFERENCES "public"."metric_data"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metric_data_tags"
    ADD CONSTRAINT "metric_data_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metrics"
    ADD CONSTRAINT "metrics_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."metrics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_metric_data_id_fkey" FOREIGN KEY ("metric_data_id") REFERENCES "public"."metric_data"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



































































































































































































GRANT ALL ON TABLE "public"."categories" TO "postgres";
GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."chart_highlights" TO "postgres";
GRANT ALL ON TABLE "public"."chart_highlights" TO "anon";
GRANT ALL ON TABLE "public"."chart_highlights" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_highlights" TO "service_role";



GRANT ALL ON TABLE "public"."charts" TO "postgres";
GRANT ALL ON TABLE "public"."charts" TO "anon";
GRANT ALL ON TABLE "public"."charts" TO "authenticated";
GRANT ALL ON TABLE "public"."charts" TO "service_role";



GRANT ALL ON TABLE "public"."file_tags" TO "postgres";
GRANT ALL ON TABLE "public"."file_tags" TO "anon";
GRANT ALL ON TABLE "public"."file_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."file_tags" TO "service_role";



GRANT ALL ON TABLE "public"."files" TO "postgres";
GRANT ALL ON TABLE "public"."files" TO "anon";
GRANT ALL ON TABLE "public"."files" TO "authenticated";
GRANT ALL ON TABLE "public"."files" TO "service_role";



GRANT ALL ON TABLE "public"."metric_data" TO "postgres";
GRANT ALL ON TABLE "public"."metric_data" TO "anon";
GRANT ALL ON TABLE "public"."metric_data" TO "authenticated";
GRANT ALL ON TABLE "public"."metric_data" TO "service_role";



GRANT ALL ON TABLE "public"."metric_data_tags" TO "postgres";
GRANT ALL ON TABLE "public"."metric_data_tags" TO "anon";
GRANT ALL ON TABLE "public"."metric_data_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."metric_data_tags" TO "service_role";



GRANT ALL ON TABLE "public"."metrics" TO "postgres";
GRANT ALL ON TABLE "public"."metrics" TO "anon";
GRANT ALL ON TABLE "public"."metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."metrics" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "postgres";
GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT ALL ON TABLE "public"."regions" TO "postgres";
GRANT ALL ON TABLE "public"."regions" TO "anon";
GRANT ALL ON TABLE "public"."regions" TO "authenticated";
GRANT ALL ON TABLE "public"."regions" TO "service_role";



GRANT ALL ON TABLE "public"."sources" TO "postgres";
GRANT ALL ON TABLE "public"."sources" TO "anon";
GRANT ALL ON TABLE "public"."sources" TO "authenticated";
GRANT ALL ON TABLE "public"."sources" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "postgres";
GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;

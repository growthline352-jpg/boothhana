package com.boothhana.interests;

import com.boothhana.api.ApiException;
import java.util.*;

/** One registry for onboarding, account settings and published-catalogue matching.
 * Topics use reviewed subject labels only; event names are never classification input. */
public final class InterestTaxonomy {
    private InterestTaxonomy() {}
    public record Option(String code,String label,List<String> types,List<String> subjects) {}
    public record Field(String code,String label,List<Option> formats,List<Option> topics) {}
    public record Selection(List<String> formats,List<String> topics) {
        public Selection { formats=formats==null?List.of():Collections.unmodifiableList(new ArrayList<>(formats));topics=topics==null?List.of():Collections.unmodifiableList(new ArrayList<>(topics)); }
        public boolean empty(){return formats.isEmpty()&&topics.isEmpty();}
    }
    private static Option type(String code,String label,String... types){return new Option(code,label,List.of(types),List.of());}
    private static Option subject(String code,String label,String... aliases){return new Option(code,label,List.of(),List.of(aliases));}
    public static final List<Field> FIELDS=List.of(
        new Field("SUBCULTURE","서브컬처",List.of(
            type("COMIC_DOUJIN","코믹·동인","COMIC_DOUJIN"),type("ONLY_EVENT","온리전","ONLY_EVENT"),
            type("BIRTHDAY_CAFE","생일카페","BIRTHDAY_CAFE"),type("DOLL","인형 행사","DOLL"),
            type("STATIONERY_GOODS","문구·굿즈 행사","STATIONERY_GOODS"),
            type("SUBCULTURE_MUSIC","애니·게임·버추얼 공연","SUBCULTURE_MUSIC"),
            type("ANIME_GAME_FESTIVAL","애니·게임 행사","ANIME_GAME_FESTIVAL"),
            type("ART_BOOK","아트북·독립출판","ART_BOOK"),type("BOARD_GAME","보드게임","BOARD_GAME"),
            type("CHARACTER_ART","캐릭터·아트","CHARACTER_ART"),type("ILLUSTRATION","일러스트 행사","ILLUSTRATION")),List.of(
            subject("VOCALOID","보컬로이드","보컬로이드","vocaloid","하츠네 미쿠","하츠네미쿠","초음미쿠"),
            subject("VTUBER","버튜버","버튜버","버츄얼 유튜버","버추얼 유튜버","vtuber","버추얼","버츄얼","버추얼 콘텐츠","버츄얼 콘텐츠"),
            subject("ANIME_MANGA","애니·만화","애니","애니메이션","만화","애니·만화","주술회전","하이큐","명탐정 코난","가비지타임"),
            subject("GAME","게임","게임","리듬게임","원신","붕괴: 스타레일","붕괴 스타레일","젠레스 존 제로","블루 아카이브","블루아카이브","페르소나"),
            subject("NOVEL","소설·웹소설","소설","웹소설","괴담출근","괴담에 떨어져도 출근을 해야 하는구나","데못죽","데뷔 못 하면 죽는 병 걸림"),
            subject("ILLUSTRATION","일러스트·창작","일러스트","일러스트레이션","창작","오리지널"))),
        new Field("EXHIBITION","박람회",List.of(
            type("FAIR","박람회·전시회","WINE","WEDDING","LIFESTYLE","DESIGN","BUSINESS"),
            subject("ART_FAIR","아트페어","아트페어","art fair"),type("BUSINESS_EXPO","산업·비즈니스 전시","BUSINESS")),List.of(
            type("WINE","주류·와인","WINE"),type("WEDDING","웨딩","WEDDING"),type("LIFESTYLE","생활·취미","LIFESTYLE"),
            type("DESIGN","디자인·아트","DESIGN"),type("BUSINESS","창업·산업","BUSINESS"))),
        new Field("FESTIVAL","축제",List.of(
            type("LIVE","공연·음악 축제","MUSIC"),type("STREET","거리·걷기 행사","WALK"),type("LIGHT_SHOW","불꽃·빛 축제","LIGHT"),
            type("FOOD_FEST","먹거리 축제","FOOD"),type("CULTURE_FEST","지역·문화 축제","CULTURE")),List.of(
            type("MUSIC","음악","MUSIC"),subject("JAZZ","재즈","재즈","jazz","jazz_hiphop"),subject("ROCK","록·밴드","록","락","rock","밴드"),
            subject("KPOP","K-POP","k-pop","kpop","kpop_idol","케이팝"),type("FOOD","먹거리","FOOD"),type("LIGHT","불꽃·빛","LIGHT"),type("LOCAL_CULTURE","지역·전통문화","CULTURE")))
    );
    public static Field field(String category){return FIELDS.stream().filter(f->f.code().equals(category)).findFirst().orElseThrow(()->ApiException.badRequest("행사 분야를 확인해 주세요."));}
    public static Map<String,Selection> validate(Map<String,Selection> fields){
        if(fields==null||fields.size()>3)throw ApiException.badRequest("관심 분야를 확인해 주세요.");
        Map<String,Selection> result=new LinkedHashMap<>();
        fields.forEach((category,selection)->{
            Field options=field(category);if(selection==null)throw ApiException.badRequest("관심 항목을 확인해 주세요.");
            validateCodes(selection.formats(),options.formats());validateCodes(selection.topics(),options.topics());result.put(category,selection);
        });return Collections.unmodifiableMap(result);
    }
    private static void validateCodes(List<String> codes,List<Option> options){
        if(codes.size()>options.size()||new HashSet<>(codes).size()!=codes.size()||codes.stream().anyMatch(code->options.stream().noneMatch(o->o.code().equals(code))))
            throw ApiException.badRequest("해당 분야의 관심 항목을 선택해 주세요.");
    }
    /** Caller-supplied codes become bound values through the fixed registry. Apply before LIMIT. */
    public static String predicate(String category,Selection selection,String alias,List<Object> args){
        if(selection==null||selection.empty())return "true";
        Field field=field(category);validate(Map.of(category,selection));
        List<Option> chosen=new ArrayList<>();
        field.formats().stream().filter(o->selection.formats().contains(o.code())).forEach(chosen::add);
        field.topics().stream().filter(o->selection.topics().contains(o.code())).forEach(chosen::add);
        List<String> clauses=new ArrayList<>();
        for(Option option:chosen){
            if(!option.types().isEmpty()){clauses.add(alias+".snapshot_json->'event'->>'subcategory' in ("+marks(option.types().size())+")");args.addAll(option.types());}
            {
                var aliases=new LinkedHashSet<String>();aliases.add(option.code().toLowerCase(Locale.ROOT));
                option.subjects().forEach(value->aliases.add(value.toLowerCase(Locale.ROOT)));
                clauses.add("exists(select 1 from jsonb_array_elements_text(coalesce("+alias+".snapshot_json->'event'->'subjects','[]'::jsonb)) topic(value) where lower(trim(topic.value)) in ("+marks(aliases.size())+"))");
                args.addAll(aliases);
            }
        }return "("+String.join(" or ",clauses)+")";
    }
    private static String marks(int n){return String.join(",",Collections.nCopies(n,"?"));}
}

"""Execute verbatim createReservation/createPos bodies + real inventory rules.
Uses in-memory persistence and fixed public/owned fixture gates. Not HTTP/JPA/DB.
No network and no application-source writes.
"""
from pathlib import Path
import argparse,importlib.util,subprocess,tempfile,hashlib,json
R=Path(__file__).resolve().parents[2];J=R/'backend/src/main/java/com/boothhana';here=Path(__file__).resolve().parent
src=(J/'service/PlatformService.java').read_text()
def method(name):
 start=src.index('    public '+('ReservationView' if name=='createReservation' else 'PosView')+' '+name+'(')
 begin=src.index('{',start);depth=0;quote=False;escape=False
 for i in range(begin,len(src)):
  c=src[i]
  if quote:
   if escape:escape=False
   elif c=='\\':escape=True
   elif c=='"':quote=False
  elif c=='"':quote=True
  elif c=='{':depth+=1
  elif c=='}':
   depth-=1
   if depth==0:return src[start:i+1]
 raise ValueError('method not terminated')
methods=[method('createReservation'),method('createPos')]
for name,text in zip(['createReservation','createPos'],methods):
 print('EXTRACTED',name,'SHA256',hashlib.sha256(text.encode()).hexdigest(),flush=True)
base=r'''
package com.boothhana.service;
import java.util.*;import java.time.Instant;
import com.boothhana.api.ApiException;import com.boothhana.api.ApiModels.*;
import com.boothhana.domain.*;import com.boothhana.domain.DomainEnums.*;
import com.boothhana.repository.EventProductRepository;
public class TradeBodyRegression {
 static class MemoryRepository<T> { List<T> rows=new ArrayList<>();public T save(T t){try{var id=t.getClass().getField("id");if(id.get(t)==null){id.set(t,Long.valueOf(rows.size()+1));rows.add(t);}return t;}catch(Exception e){throw new RuntimeException(e);}}}
 static class Products implements EventProductRepository { final EventProduct p;Products(EventProduct p){this.p=p;}public Optional<EventProduct> findByIdForUpdate(Long id){return Objects.equals(id,p.id)?Optional.of(p):Optional.empty();} public EventProduct save(EventProduct p){return p;} }
 final TradeTest.Db receipts=new TradeTest.Db();final TradeRequestService tradeRequests=new TradeRequestService(receipts);
 final EventProduct product=new EventProduct(); final EventBooth booth=new EventBooth();final Event event=new Event();
 final MemoryRepository<Reservation> reservations=new MemoryRepository<>(); final MemoryRepository<ReservationItem> reservationItems=new MemoryRepository<>();
 final MemoryRepository<PosSale> posSales=new MemoryRepository<>(); final MemoryRepository<PosSaleItem> posItems=new MemoryRepository<>(); final InventoryOperations inventory;
 TradeBodyRegression(){product.id=1L;product.eventBoothId=10L;product.price=3000;product.stockQuantity=10;booth.id=10L;booth.eventId=20L;event.id=20L;event.status=EventStatus.PUBLISHED;inventory=new InventoryOperations(new Products(product));}
 private EventBooth requirePublicEventBooth(Long id){return booth;} private Event requireEvent(Long id){return event;}
 private EventBooth requireMutableOwnedEventBooth(UserAccount owner,Long id){return booth;}
 private void decrement(EventProduct p,int q){inventory.decrement(p,q);} private String number(String prefix){return RecordNumbers.create(prefix);}
 private ReservationView reservationView(Reservation r){return null;}private PosView posView(PosSale p){return null;}
 private ReservationView userReservation(UserAccount user,Long id){if(reservations.rows.stream().noneMatch(r->r.id.equals(id)))throw new AssertionError();return null;}
 private PosView posSale(UserAccount user,Long id){if(posSales.rows.stream().noneMatch(r->r.id.equals(id)))throw new AssertionError();return null;}
'''
tail=r'''
 public static void main(String[]args){
  UserAccount user=new UserAccount();user.id=9L;
  TradeBodyRegression a=new TradeBodyRegression();var r=new ReservationInput(10L,List.of(new LineInput(1L,2)),UUID.randomUUID());
  a.createReservation(user,r);a.createReservation(user,r);
  if(a.reservations.rows.size()!=1||a.product.stockQuantity!=8||a.receipts.inserts!=1)throw new AssertionError("reservation replay");
  System.out.println("PASS actual reservation body: same logical ID twice => 1 reservation / stock 8 / 1 receipt");
  try{a.createReservation(user,new ReservationInput(10L,List.of(new LineInput(1L,1)),r.requestId()));throw new AssertionError();}catch(ApiException e){if(e.status.value()!=409)throw e;}
  if(a.product.stockQuantity!=8)throw new AssertionError("conflicting payload debited");
  TradeBodyRegression b=new TradeBodyRegression();var s=new PosInput(10L,PaymentMethod.CASH,List.of(new LineInput(1L,2)),UUID.randomUUID());
  b.createPos(user,s);b.createPos(user,s);
  if(b.posSales.rows.size()!=1||b.product.stockQuantity!=8||b.receipts.inserts!=1)throw new AssertionError("pos replay");
  System.out.println("PASS actual POS body: same logical ID twice => 1 sale / stock 8 / 1 receipt");
  try{b.createPos(user,new PosInput(10L,PaymentMethod.TRANSFER,s.items(),s.requestId()));throw new AssertionError();}catch(ApiException e){if(e.status.value()!=409)throw e;}
  if(b.product.stockQuantity!=8)throw new AssertionError("conflicting payment debited");
  b.createPos(user,new PosInput(10L,PaymentMethod.CASH,s.items(),UUID.randomUUID()));
  if(b.posSales.rows.size()!=2||b.product.stockQuantity!=6)throw new AssertionError("legitimate new sale blocked");
  System.out.println("PASS actual bodies: changed payload409 with unchanged stock; new intent => new record.");
  System.out.println("Extracted verbatim PlatformService creation bodies + actual rules/request service. In-memory repositories and scripted JDBC; NOT Spring/SQL concurrency or transaction execution.");
 }
}
'''
spec=importlib.util.spec_from_file_location('contracts',R/'verification/v12/check_java_contracts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
stubs={k:v for k,v in m.STUBS.items() if k.startswith('jakarta/validation/') or k in ['org/springframework/http/HttpStatus.java','org/springframework/stereotype/Service.java','org/springframework/transaction/annotation/Transactional.java','org/springframework/transaction/annotation/Propagation.java','org/springframework/jdbc/core/JdbcTemplate.java','org/springframework/jdbc/core/RowMapper.java','org/springframework/jdbc/core/ConnectionCallback.java']}
for name,props in {'Entity':'','Id':'','Version':'','Column':'String name() default "";boolean nullable() default true;boolean unique() default false;String columnDefinition() default "";', 'GeneratedValue':'GenerationType strategy();','Enumerated':'EnumType value();','UniqueConstraint':'String[] columnNames();','Table':'String name();UniqueConstraint[] uniqueConstraints() default {};'} .items():
 stubs['jakarta/persistence/'+name+'.java']='package jakarta.persistence;public @interface '+name+'{'+props+'}'
stubs['jakarta/persistence/EnumType.java']='package jakarta.persistence;public enum EnumType{STRING}'
stubs['jakarta/persistence/GenerationType.java']='package jakarta.persistence;public enum GenerationType{IDENTITY}'
stubs['com/boothhana/repository/EventProductRepository.java']='package com.boothhana.repository;import java.util.*;import com.boothhana.domain.EventProduct;public interface EventProductRepository{Optional<EventProduct> findByIdForUpdate(Long id);EventProduct save(EventProduct p);}'
actual=['api/ApiException.java','api/ApiModels.java','domain/DomainEnums.java']+['domain/'+x+'.java' for x in ['Event','EventBooth','EventProduct','Reservation','ReservationItem','PosSale','PosSaleItem','UserAccount']]+['service/'+x+'.java' for x in ['InventoryOperations','StockRules','RecordNumbers','TradeRequestRules','TradeRequestService']]
with tempfile.TemporaryDirectory(prefix='boothhana-trade-review-') as tmp:
 t=Path(tmp);files=[]
 for n,s in stubs.items():
  f=t/n;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(s);files.append(f)
 files.append(R/'verification/v14/TradeTest.java')
 f=t/'com/boothhana/service/TradeBodyRegression.java';f.parent.mkdir(parents=True,exist_ok=True);f.write_text(base+'\n'.join(methods)+tail);files.append(f)
 subprocess.run(['javac','-encoding','UTF-8','-d',str(t/'classes'),*map(str,files),*[str(J/a) for a in actual]],check=True)
 subprocess.run(['java','-cp',str(t/'classes'),'com.boothhana.service.TradeBodyRegression'],check=True)
